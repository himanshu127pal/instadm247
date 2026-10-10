/**
 * The scheduled profile refresh. Run from e2e-check.ts; Instagram is stubbed
 * at fetch.
 *
 * The bug this guards: Instagram signs the links to profile pictures and post
 * images and they expire after a few days. We only re-pulled them when
 * someone pressed Sync, so avatars and post thumbnails went blank until then.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import { refreshStaleProfiles } from "../src/lib/meta/account";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;
type Mutable = { meta: { appId: string; appSecret: string } };
const mutableEnv = env as unknown as Mutable;

const HOUR = 60 * 60 * 1000;

export async function runProfileRefreshChecks(prisma: PrismaClient, check: Check, section: Section) {
  section("Expired Instagram picture links are refreshed on a schedule");
  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({
    data: { name: `e2e pics ${tag}`, slug: `e2e-pics-${tag}`, planKey: "free" },
  });
  const make = (name: string, lastSyncAt: Date | null) =>
    prisma.instagramAccount.create({
      data: {
        workspaceId: workspace.id, igUserId: `e2e_pics_${name}_${tag}`, username: `e2e_${name}_${tag}`,
        status: "connected", accessTokenEnc: encrypt(`tok_${name}_${tag}`), lastSyncAt,
        profilePictureUrl: "https://scontent.cdninstagram.com/old.jpg?oe=EXPIRED",
      },
    });
  const stale = await make("stale", new Date(Date.now() - 2 * 24 * HOUR));
  const fresh = await make("fresh", new Date(Date.now() - 2 * HOUR));
  const dead = await make("dead", null);
  await prisma.media.create({
    data: { accountId: stale.id, igMediaId: `m_${tag}`, mediaType: "IMAGE", mediaUrl: "https://scontent.cdninstagram.com/post.jpg?oe=EXPIRED" },
  });

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.hostname !== "graph.instagram.com") return realFetch(url, init);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!token.endsWith(tag)) return json(400, { error: { message: "Not this test's account", code: 100 } });
    if (token.startsWith("tok_dead")) {
      return json(400, { error: { message: "Error validating access token", type: "OAuthException", code: 190 } });
    }
    const who = token.split("_")[1];
    if (u.pathname.endsWith("/me/media")) {
      return json(200, { data: [{ id: `m_${tag}`, media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/post.jpg?oe=NEW" }] });
    }
    if (u.pathname.endsWith("/me")) {
      return json(200, { user_id: who, username: `e2e_${who}_${tag}`, profile_picture_url: `https://scontent.cdninstagram.com/${who}.jpg?oe=NEW` });
    }
    return json(404, { error: { message: "Unknown path", code: 803 } });
  }) as typeof fetch;
  const saved = { appId: mutableEnv.meta.appId, appSecret: mutableEnv.meta.appSecret };
  mutableEnv.meta.appId = "e2e-app-id";
  mutableEnv.meta.appSecret = "e2e-app-secret";

  try {
    await refreshStaleProfiles();
    const [s, f, d, post] = await Promise.all([
      prisma.instagramAccount.findUniqueOrThrow({ where: { id: stale.id } }),
      prisma.instagramAccount.findUniqueOrThrow({ where: { id: fresh.id } }),
      prisma.instagramAccount.findUniqueOrThrow({ where: { id: dead.id } }),
      prisma.media.findFirstOrThrow({ where: { accountId: stale.id } }),
    ]);
    check("an account not synced for a day gets a new picture link", s.profilePictureUrl?.includes("oe=NEW") === true, s.profilePictureUrl ?? "null");
    check("its post images are refreshed too", post.mediaUrl?.includes("oe=NEW") === true, post.mediaUrl ?? "null");
    check("an account synced a couple of hours ago is left alone", f.profilePictureUrl?.includes("oe=EXPIRED") === true);
    check("an account whose token has died is marked as needing reconnect", d.status === "token_expired", d.status);
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.meta.appId = saved.appId;
    mutableEnv.meta.appSecret = saved.appSecret;
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
