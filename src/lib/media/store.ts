import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { LIMITS } from "./rules";

/**
 * Files uploaded for the scheduler. See docs/SCHEDULER.md.
 *
 * Instagram's Content Publishing API takes a public URL and fetches the file
 * itself, so a file from someone's phone has to live somewhere Instagram can
 * reach. It lives here, under a random token, and is served at
 * `/m/<token>.<ext>` until it's published, then deleted.
 *
 * The type is decided from the file's own bytes, never from its name or the
 * browser's say-so, and only JPEG, MP4 and MOV are kept: nothing that a
 * browser would run as a page.
 */

export const EXT: Record<string, string> = { "image/jpeg": "jpg", "video/mp4": "mp4", "video/quicktime": "mov" };

/** A workspace's files waiting to be published, at most. */
export const WORKSPACE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
/** Uploaded but never used in a post: swept after this. */
export const UNUSED_TTL_MS = 24 * 60 * 60 * 1000;
/** Kept after a post is published or cancelled, then swept. */
export const DONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failed post can be retried, so its files are kept longer. */
export const FAILED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function uploadDir(): string {
  return path.resolve(env.uploadDir);
}

/** Tokens are 32 url-safe characters; nothing else ever becomes a path. */
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
export function isToken(value: string): boolean {
  return TOKEN.test(value);
}

export function filePath(token: string): string {
  if (!isToken(token)) throw new Error("bad token");
  return path.join(uploadDir(), token);
}

export function publicUrl(upload: { token: string; mime: string }): string {
  return `${env.appUrl}/m/${upload.token}.${EXT[upload.mime] ?? "bin"}`;
}

/** Our upload behind a URL, if it is one: `${APP_URL}/m/<token>.<ext>`. */
export function tokenFromUrl(url: string): string | null {
  const prefix = `${env.appUrl}/m/`;
  if (!url.startsWith(prefix)) return null;
  const token = url.slice(prefix.length).replace(/\.[a-z0-9]+$/, "");
  return isToken(token) ? token : null;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** What the first bytes say the file is. */
export function sniff(head: Buffer): "image/jpeg" | "video/mp4" | "video/quicktime" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") {
    return head.toString("latin1", 8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  }
  return null;
}

/** Width and height from a JPEG's frame header, honouring EXIF rotation. */
export function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  let rotated = false;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // APP1 Exif: orientations 5-8 swap width and height.
    if (marker === 0xe1 && buf.toString("latin1", i + 4, i + 8) === "Exif") {
      const o = exifOrientation(buf.subarray(i + 10, i + 2 + len));
      rotated = o !== null && o >= 5 && o <= 8;
    }
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return rotated ? { width: height, height: width } : { width, height };
    }
    i += 2 + len;
  }
  return null;
}

function exifOrientation(tiff: Buffer): number | null {
  if (tiff.length < 8) return null;
  const le = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return null;
}

/**
 * Stream an upload to disk, refusing it as soon as it passes the limit for its
 * type, and record it. The browser's numbers are trusted only for what the
 * server can't measure without a video decoder: a video's size and length.
 */
export async function saveUpload(input: {
  workspaceId: string;
  body: ReadableStream<Uint8Array>;
  video?: { width: number; height: number; durationSec: number };
}) {
  const used = await prisma.mediaUpload.aggregate({
    where: { workspaceId: input.workspaceId, OR: [{ scheduledPostId: null }, { scheduledPost: { status: { in: ["scheduled", "publishing", "failed"] } } }] },
    _sum: { sizeBytes: true },
  });
  const room = WORKSPACE_QUOTA_BYTES - (used._sum.sizeBytes ?? 0);
  if (room <= 0) {
    throw new UploadError("You have 2 GB of files waiting to be published. Remove some scheduled posts first.", 413);
  }

  await mkdir(uploadDir(), { recursive: true });
  const token = randomBytes(24).toString("base64url");
  const target = filePath(token);
  const out = createWriteStream(target, { flags: "wx", mode: 0o640 });

  let size = 0;
  let head = Buffer.alloc(0);
  let mime: ReturnType<typeof sniff> = null;
  let limit = Math.min(LIMITS.reel.maxBytes, room);
  try {
    const reader = input.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (!mime) {
        head = Buffer.concat([head, Buffer.from(value)]);
        if (head.length >= 12) {
          mime = sniff(head);
          if (!mime) throw new UploadError("Instagram publishes JPEG photos and MP4 or MOV videos. This file is neither.");
          if (mime === "image/jpeg") limit = Math.min(LIMITS.image.maxBytes, room);
        }
      }
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new UploadError(
          limit === room
            ? "This file would take you past 2 GB of files waiting to be published."
            : mime === "image/jpeg"
              ? "Photos can be up to 8 MB."
              : "Videos can be up to 300 MB.",
          413,
        );
      }
      if (!out.write(value)) await new Promise((resolve) => out.once("drain", resolve));
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (!mime) throw new UploadError("That file is empty or too small to be a photo or video.");

    let width: number;
    let height: number;
    let durationSec: number | null = null;
    if (mime === "image/jpeg") {
      const buf = await readHead(target, 256 * 1024);
      const dims = jpegSize(buf);
      if (!dims) throw new UploadError("That JPEG couldn't be read. Try exporting it again.");
      ({ width, height } = dims);
    } else {
      const v = input.video;
      if (!v || !(v.width > 0 && v.height > 0 && v.durationSec > 0)) {
        throw new UploadError("That video couldn't be read in your browser, so we can't check it against Instagram's rules.");
      }
      ({ width, height, durationSec } = { width: Math.round(v.width), height: Math.round(v.height), durationSec: v.durationSec });
    }

    return await prisma.mediaUpload.create({
      data: {
        workspaceId: input.workspaceId,
        token,
        kind: mime === "image/jpeg" ? "image" : "video",
        mime,
        sizeBytes: size,
        width,
        height,
        durationSec,
      },
    });
  } catch (error) {
    out.destroy();
    await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readHead(file: string, bytes: number): Promise<Buffer> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const buf = Buffer.alloc(Math.min(bytes, size));
    await handle.read(buf, 0, buf.length, 0);
    return buf;
  } finally {
    await handle.close();
  }
}

/**
 * Open a stored file for serving, with its size, or null if it's gone. A
 * range that starts past the end comes back with no stream (a 416).
 */
export async function openUpload(token: string, range?: { start: number; end?: number }) {
  const upload = await prisma.mediaUpload.findUnique({ where: { token } });
  if (!upload) return null;
  const file = filePath(token);
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  const end = range ? Math.min(range.end ?? info.size - 1, info.size - 1) : info.size - 1;
  const start = range ? range.start : 0;
  if (start > end) return { upload, size: info.size, start, end, stream: null };
  return { upload, size: info.size, start, end, stream: createReadStream(file, { start, end }) };
}

/** Delete an upload's file and its row. */
export async function deleteUpload(token: string): Promise<void> {
  await rm(filePath(token), { force: true }).catch(() => undefined);
  await prisma.mediaUpload.delete({ where: { token } }).catch(() => undefined);
}

/**
 * Daily sweep: files nobody used, and files whose post is done with them.
 * Returns how many were removed.
 */
export async function purgeUploads(now = Date.now()): Promise<number> {
  const at = (ms: number) => new Date(now - ms);
  const stale = await prisma.mediaUpload.findMany({
    where: {
      OR: [
        { scheduledPostId: null, createdAt: { lt: at(UNUSED_TTL_MS) } },
        { scheduledPost: { status: { in: ["published", "cancelled"] }, updatedAt: { lt: at(DONE_TTL_MS) } } },
        { scheduledPost: { status: "failed", updatedAt: { lt: at(FAILED_TTL_MS) } } },
      ],
    },
    select: { token: true },
    take: 500,
  });
  for (const { token } of stale) await deleteUpload(token);
  return stale.length;
}
