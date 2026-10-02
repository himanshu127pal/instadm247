/**
 * Scheduler uploads and Instagram's media rules, and DM senders' names. Run
 * from e2e-check.ts. See docs/SCHEDULER.md.
 *
 * The bugs these guard:
 * - the Scheduler asked for a public URL, which most creators don't have, and
 *   never checked a file's shape, so a post Instagram would refuse was only
 *   found out at publish time;
 * - a person who first messaged by DM showed in the Inbox as a number, because
 *   a DM webhook carries only their scoped ID.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import { checkMedia, checkPost, nearestImageCrop, type MediaFacts } from "../src/lib/media/rules";
import {
  UploadError,
  filePath,
  jpegSize,
  publicUrl,
  purgeUploads,
  saveUpload,
  sniff,
  tokenFromUrl,
  DONE_TTL_MS,
  UNUSED_TTL_MS,
  WORKSPACE_QUOTA_BYTES,
} from "../src/lib/media/store";
import { checkScheduledMedia } from "../src/lib/media/validate";
import { GET as serveMedia } from "../src/app/m/[file]/route";
import { profileNeedsLookup, refreshContactProfile } from "../src/lib/meta/profile";
import { contactLabel } from "../src/lib/utils";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;
type Mutable = { uploadDir: string; meta: { appId: string; appSecret: string } };
const mutableEnv = env as unknown as Mutable;

const MB = 1024 * 1024;
const HOUR = 3_600_000;

/** A JPEG's header only: start, optional EXIF orientation, a frame header. */
function jpeg(width: number, height: number, orientation?: number, padTo = 0): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    // TIFF, big-endian: header, one IFD entry (0x0112 Orientation, SHORT, 1).
    const tiff = Buffer.alloc(8 + 2 + 12 + 4);
    tiff.write("MM", 0, "latin1");
    tiff.writeUInt16BE(42, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10);
    tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt16BE(orientation, 18);
    const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
    const seg = Buffer.alloc(4);
    seg.writeUInt16BE(0xffe1, 0);
    seg.writeUInt16BE(body.length + 2, 2);
    parts.push(seg, body);
  }
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  const out = Buffer.concat(parts);
  return padTo > out.length ? Buffer.concat([out, Buffer.alloc(padTo - out.length)]) : out;
}

const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom", "latin1"), Buffer.alloc(64)]);
const MOV_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  ", "latin1"), Buffer.alloc(64)]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

/** A request body, delivered in chunks the way a browser's upload arrives. */
function body(buf: Buffer, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= buf.length) return controller.close();
      controller.enqueue(new Uint8Array(buf.subarray(at, at + chunk)));
      at += chunk;
    },
  });
}

async function refused(promise: Promise<unknown>): Promise<UploadError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof UploadError ? error : null;
  }
}

const img = (width: number, height: number, extra: Partial<MediaFacts> = {}): MediaFacts => ({
  kind: "image", mime: "image/jpeg", width, height, sizeBytes: 2 * MB, ...extra,
});
const vid = (width: number, height: number, durationSec: number, extra: Partial<MediaFacts> = {}): MediaFacts => ({
  kind: "video", mime: "video/mp4", width, height, sizeBytes: 50 * MB, durationSec, ...extra,
});

export async function runMediaChecks(prisma: PrismaClient, check: Check, section: Section) {
  // --- The rules ------------------------------------------------------------

  section("Scheduler: Instagram's media rules");
  const ok = (c: { errors: string[] }) => c.errors.length === 0;
  check("a 4:5 portrait photo is fine", ok(checkMedia(img(1080, 1350), "IMAGE")));
  check("so is 1:1, and 1.91:1 landscape", ok(checkMedia(img(1080, 1080), "IMAGE")) && ok(checkMedia(img(1080, 566), "IMAGE")));
  const tall = checkMedia(img(1080, 1920), "IMAGE");
  check("a 9:16 photo is refused, saying why", tall.errors.some((e) => e.includes("taller than Instagram allows") && e.includes("9:16")), tall.errors.join());
  check("a panorama is refused as too wide", checkMedia(img(3000, 1000), "IMAGE").errors.some((e) => e.includes("wider")));
  check("the suggested crop for a tall photo is 4:5", nearestImageCrop(1080, 1920).ratio === 4 / 5);
  check("and for a wide one, 1.91:1", nearestImageCrop(3000, 1000).ratio === 1.91);
  check("a PNG is refused (it's converted in the browser first)", !ok(checkMedia(img(1080, 1080, { mime: "image/png" }), "IMAGE")));
  check("a photo over 8 MB is refused", !ok(checkMedia(img(1080, 1080, { sizeBytes: 9 * MB }), "IMAGE")));
  check("a photo can't be a Reel", !ok(checkMedia(img(1080, 1350), "REELS")));
  check("a video can't be an image post", !ok(checkMedia(vid(1080, 1920, 20), "IMAGE")));

  const reel = checkMedia(vid(1080, 1920, 20), "REELS");
  check("a 9:16 Reel is fine, with no warning", ok(reel) && reel.warnings.length === 0);
  const wide = checkMedia(vid(1920, 1080, 20), "REELS");
  check("a 16:9 Reel is allowed, with a warning about bars", ok(wide) && wide.warnings.some((w) => w.includes("9:16")));
  check("a 2-second video is refused", !ok(checkMedia(vid(1080, 1920, 2), "REELS")));
  check("a 16-minute video is refused", !ok(checkMedia(vid(1080, 1920, 16 * 60), "REELS")));
  check("a video over 300 MB is refused", !ok(checkMedia(vid(1080, 1920, 20, { sizeBytes: 301 * MB }), "REELS")));
  check("a 70-second video is fine as a Reel", ok(checkMedia(vid(1080, 1920, 70), "REELS")));
  check("but not in a carousel (60 seconds there)", !ok(checkMedia(vid(1080, 1920, 70), "CAROUSEL")));

  check("a carousel needs two files", !ok(checkPost([img(1080, 1080)], "CAROUSEL")));
  check("and at most ten", !ok(checkPost(Array.from({ length: 11 }, () => img(1080, 1080)), "CAROUSEL")));
  check("mixed shapes in a carousel are a warning, not an error", (() => {
    const c = checkPost([img(1080, 1080), img(1080, 1350)], "CAROUSEL");
    return ok(c) && c.warnings.length === 1;
  })());
  check("only a carousel can have several files", !ok(checkPost([img(1080, 1080), img(1080, 1080)], "IMAGE")));

  // --- Reading files ----------------------------------------------------------

  section("Scheduler: reading uploaded files");
  check("a JPEG is recognised by its bytes", sniff(jpeg(10, 10)) === "image/jpeg");
  check("an MP4 by its ftyp box", sniff(MP4_HEAD) === "video/mp4");
  check("a MOV too", sniff(MOV_HEAD) === "video/quicktime");
  check("a PNG is not accepted", sniff(PNG_HEAD) === null);
  check("a JPEG's size comes from its frame header", JSON.stringify(jpegSize(jpeg(1080, 1350))) === JSON.stringify({ width: 1080, height: 1350 }));
  check(
    "and a phone photo stored sideways (EXIF rotation 6) is measured the way it's seen",
    JSON.stringify(jpegSize(jpeg(1920, 1080, 6))) === JSON.stringify({ width: 1080, height: 1920 }),
    JSON.stringify(jpegSize(jpeg(1920, 1080, 6))),
  );
  check("rotation 1 leaves it as stored", jpegSize(jpeg(1920, 1080, 1))?.width === 1920);

  // --- Storing, serving, scheduling, sweeping -----------------------------------

  const dir = mkdtempSync(path.join(tmpdir(), "e2e-uploads-"));
  const savedDir = mutableEnv.uploadDir;
  mutableEnv.uploadDir = dir;
  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({ data: { name: `e2e media ${tag}`, slug: `e2e-media-${tag}`, planKey: "pro" } });
  const other = await prisma.workspace.create({ data: { name: `e2e media other ${tag}`, slug: `e2e-media-o-${tag}`, planKey: "pro" } });
  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id, igUserId: `e2e_media_ig_${tag}`, username: `e2e_media_${tag}`,
      status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token"),
    },
  });

  try {
    section("Scheduler: storing uploads");
    const photo = await saveUpload({ workspaceId: workspace.id, body: body(jpeg(1080, 1350, undefined, 300 * 1024)) });
    check("a JPEG is stored, measured from the file", photo.kind === "image" && photo.width === 1080 && photo.height === 1350);
    check("on disk under its token, not readable by other users", existsSync(filePath(photo.token)) && (statSync(filePath(photo.token)).mode & 0o007) === 0);
    check("its public URL ends in .jpg, and maps back to the token", publicUrl(photo).endsWith(".jpg") && tokenFromUrl(publicUrl(photo)) === photo.token);
    check("someone else's URL isn't mistaken for ours", tokenFromUrl("https://cdn.example.com/m/" + photo.token + ".jpg") === null);

    const before = (await prisma.mediaUpload.count({ where: { workspaceId: workspace.id } })) as number;
    const png = await refused(saveUpload({ workspaceId: workspace.id, body: body(Buffer.concat([PNG_HEAD, Buffer.alloc(1000)])) }));
    check("a PNG upload is refused (the browser converts photos first)", png?.status === 400, png?.message);
    const big = await refused(saveUpload({ workspaceId: workspace.id, body: body(jpeg(1080, 1080, undefined, 9 * MB)) }));
    check("a 9 MB JPEG is refused part-way, as too large", big?.status === 413 && big.message.includes("8 MB"), big?.message);
    const noDims = await refused(saveUpload({ workspaceId: workspace.id, body: body(MP4_HEAD) }));
    check("a video without the browser's measurements is refused", noDims?.status === 400, noDims?.message);
    check(
      "and refused uploads leave nothing behind",
      (await prisma.mediaUpload.count({ where: { workspaceId: workspace.id } })) === before &&
        (await import("node:fs")).readdirSync(dir).length === before,
    );

    const video = await saveUpload({
      workspaceId: workspace.id,
      body: body(Buffer.concat([MP4_HEAD, Buffer.alloc(2 * MB)])),
      video: { width: 1080, height: 1920, durationSec: 12.5 },
    });
    check("a video is stored with the browser's size and length", video.kind === "video" && video.height === 1920 && video.durationSec === 12.5);
    check("and served as .mp4", publicUrl(video).endsWith(".mp4"));

    const hog = await prisma.mediaUpload.create({
      data: {
        workspaceId: other.id, token: randomBytes(24).toString("base64url"), kind: "video", mime: "video/mp4",
        sizeBytes: WORKSPACE_QUOTA_BYTES - 1000, width: 1080, height: 1920, durationSec: 30,
      },
    });
    const over = await refused(saveUpload({ workspaceId: other.id, body: body(jpeg(1080, 1080, undefined, 50 * 1024)) }));
    check("a workspace with 2 GB waiting can't upload more", over?.status === 413 && over.message.includes("2 GB"), over?.message);
    check("which doesn't affect another workspace", (await saveUpload({ workspaceId: workspace.id, body: body(jpeg(1080, 1080)) })).kind === "image");

    section("Scheduler: serving uploads to Instagram");
    const get = (file: string, headers: Record<string, string> = {}) =>
      serveMedia(new Request(`http://localhost/m/${file}`, { headers }), { params: Promise.resolve({ file }) });
    const full = await get(`${photo.token}.jpg`);
    const fullBody = Buffer.from(await full.arrayBuffer());
    check("the file is served, publicly, as a JPEG", full.status === 200 && full.headers.get("content-type") === "image/jpeg" && fullBody.length === photo.sizeBytes);
    check("never sniffed into something else, never indexed", full.headers.get("x-content-type-options") === "nosniff" && full.headers.get("x-robots-tag") === "noindex");
    const part = await get(`${video.token}.mp4`, { range: "bytes=4-11" });
    check(
      "byte ranges work, for video fetchers",
      part.status === 206 && Buffer.from(await part.arrayBuffer()).toString("latin1") === "ftypisom" && part.headers.get("content-range") === `bytes 4-11/${video.sizeBytes}`,
    );
    check("a range past the end is 416", (await get(`${video.token}.mp4`, { range: `bytes=${video.sizeBytes + 10}-` })).status === 416);
    check("the wrong extension is a 404", (await get(`${photo.token}.mp4`)).status === 404);
    check("so is a made-up token", (await get(`${"A".repeat(32)}.jpg`)).status === 404);
    check("and anything that isn't a token", (await get("..%2F..%2Fetc%2Fpasswd")).status === 404);

    section("Scheduler: checking a post before it's scheduled");
    const tallRow = await prisma.mediaUpload.create({
      data: { workspaceId: workspace.id, token: randomBytes(24).toString("base64url"), kind: "image", mime: "image/jpeg", sizeBytes: 1000, width: 1080, height: 1920 },
    });
    const fine = await checkScheduledMedia(workspace.id, "IMAGE", [publicUrl(photo)]);
    check("a photo that fits is accepted", fine.error === null && fine.uploads?.length === 1, fine.error ?? "");
    const tallCheck = await checkScheduledMedia(workspace.id, "IMAGE", [publicUrl(tallRow)]);
    check("a 9:16 photo is refused before scheduling, saying why", Boolean(tallCheck.error?.includes("taller than Instagram allows")), tallCheck.error ?? "");
    const wrongType = await checkScheduledMedia(workspace.id, "IMAGE", [publicUrl(video)]);
    check("a video in an image post is refused", Boolean(wrongType.error?.includes("image file")), wrongType.error ?? "");
    const foreign = await checkScheduledMedia(other.id, "IMAGE", [publicUrl(photo)]);
    check("another workspace's file can't be used", foreign.error === "One of those files is no longer available. Upload it again.");
    const twice = await checkScheduledMedia(workspace.id, "CAROUSEL", [publicUrl(photo), publicUrl(photo)]);
    check("the same file twice is refused", Boolean(twice.error?.includes("twice")), twice.error ?? "");
    const link = await checkScheduledMedia(workspace.id, "IMAGE", ["https://cdn.example.com/photo.jpg"]);
    check("a link to a file elsewhere is still accepted (Instagram checks it)", link.error === null);
    const lonely = await checkScheduledMedia(workspace.id, "CAROUSEL", ["https://cdn.example.com/a.jpg"]);
    check("a one-file carousel is refused even by link", Boolean(lonely.error?.includes("at least two")));
    const carousel = await checkScheduledMedia(workspace.id, "CAROUSEL", [publicUrl(photo), publicUrl(video)]);
    check("a photo and a short 9:16 video make a carousel", carousel.error === null, carousel.error ?? "");

    section("Scheduler: sweeping old uploads");
    const post = (status: string, ageMs: number) =>
      prisma.scheduledPost.create({
        data: {
          accountId: account.id, mediaType: "IMAGE", mediaUrls: [], scheduledAt: new Date(),
          status, updatedAt: new Date(Date.now() - ageMs),
        },
      });
    const oldPublished = await post("published", DONE_TTL_MS + HOUR);
    const pending = await post("scheduled", DONE_TTL_MS + HOUR);
    await prisma.mediaUpload.update({ where: { id: photo.id }, data: { scheduledPostId: oldPublished.id } });
    await prisma.mediaUpload.update({ where: { id: video.id }, data: { scheduledPostId: pending.id } });
    const reused = await checkScheduledMedia(workspace.id, "REELS", [publicUrl(video)]);
    check("a file already in a post can't be put in another", reused.error !== null);
    await prisma.mediaUpload.update({
      where: { id: tallRow.id },
      data: { createdAt: new Date(Date.now() - UNUSED_TTL_MS - HOUR) },
    });
    // Our files only: the sweep is global, so judge it by what's left of ours.
    await purgeUploads();
    const left = new Set((await prisma.mediaUpload.findMany({ where: { workspaceId: workspace.id } })).map((u) => u.token));
    check("a file never used in a post is swept after a day", !left.has(tallRow.token));
    check("a published post's file is swept after a week, from disk too", !left.has(photo.token) && !existsSync(filePath(photo.token)));
    check("a file waiting to publish is kept, however old", left.has(video.token) && existsSync(filePath(video.token)));
    await prisma.mediaUpload.delete({ where: { id: hog.id } });
  } finally {
    mutableEnv.uploadDir = savedDir;
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, other.id] } } }).catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }

  // --- DM senders' names ------------------------------------------------------

  section("Inbox: who sent a DM");
  check("a contact with a username needs no lookup", !profileNeedsLookup({ username: "maya", followerCheckedAt: null }));
  check("one with only an ID does", profileNeedsLookup({ username: null, followerCheckedAt: null }));
  check("but not again within the hour after a failed try", !profileNeedsLookup({ username: null, followerCheckedAt: new Date(Date.now() - 10 * 60_000) }));
  check("the Inbox shows @username first", contactLabel({ username: "maya", name: "Maya R" }) === "@maya");
  check("then the name", contactLabel({ username: null, name: "Maya R" }) === "Maya R");
  check("and never the raw ID", contactLabel({ username: null, name: null }) === "Instagram user");

  const ptag = randomBytes(4).toString("hex");
  const pws = await prisma.workspace.create({ data: { name: `e2e profile ${ptag}`, slug: `e2e-profile-${ptag}`, planKey: "free" } });
  const pacc = await prisma.instagramAccount.create({
    data: {
      workspaceId: pws.id, igUserId: `e2e_profile_ig_${ptag}`, username: `e2e_profile_${ptag}`,
      status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token"),
    },
  });
  const calls: string[] = [];
  let fail = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).includes("graph.instagram.com")) {
      calls.push(String(url));
      if (fail) {
        return new Response(JSON.stringify({ error: { message: "(#100) error", type: "OAuthException", code: 100, fbtrace_id: "e2e" } }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ name: "Maya Rao", username: "maya.makes", profile_pic: "https://scontent.cdninstagram.com/p.jpg", follower_count: 812, is_user_follow_business: true }),
        { status: 200 },
      );
    }
    return realFetch(url, init);
  }) as typeof fetch;
  const saved = { appId: mutableEnv.meta.appId, appSecret: mutableEnv.meta.appSecret };
  mutableEnv.meta.appId = "e2e-app-id";
  mutableEnv.meta.appSecret = "e2e-app-secret";
  try {
    const dm = await prisma.contact.create({ data: { accountId: pacc.id, igsid: `2490439988${ptag}` } });
    const filled = await refreshContactProfile(pacc, dm);
    const stored = await prisma.contact.findUnique({ where: { id: dm.id } });
    check(
      "someone who DMs first gets their username and name from Instagram",
      filled.username === "maya.makes" && stored?.username === "maya.makes" && stored.name === "Maya Rao",
      JSON.stringify({ username: stored?.username, name: stored?.name }),
    );
    check("asking for exactly the documented profile fields", calls.at(-1)?.includes(`/${dm.igsid}?`) === true && calls.at(-1)?.includes("fields=name%2Cusername") === true, calls.at(-1));
    check("and their follower status comes along", stored?.isFollower === true && stored.followerCount === 812);

    const n = calls.length;
    await refreshContactProfile(pacc, stored!);
    const commenter = await prisma.contact.create({ data: { accountId: pacc.id, igsid: `c_${ptag}`, username: "from.a.comment" } });
    await refreshContactProfile(pacc, commenter);
    check("a contact we already know, or a commenter, costs no call", calls.length === n);

    fail = true;
    const unknown = await prisma.contact.create({ data: { accountId: pacc.id, igsid: `u_${ptag}` } });
    const after = await refreshContactProfile(pacc, unknown);
    const marked = await prisma.contact.findUnique({ where: { id: unknown.id } });
    check("if Instagram won't say, the contact comes back unchanged", after.username === null && after.id === unknown.id);
    check("and the attempt is remembered so it isn't retried on every message", marked?.followerCheckedAt !== null);
    const m = calls.length;
    await refreshContactProfile(pacc, marked!);
    check("so the next message doesn't ask again", calls.length === m);
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.meta.appId = saved.appId;
    mutableEnv.meta.appSecret = saved.appSecret;
    await prisma.workspace.delete({ where: { id: pws.id } }).catch(() => undefined);
  }
}
