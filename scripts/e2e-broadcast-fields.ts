/**
 * Broadcast targeting and personalisation. Run from e2e-check.ts. Instagram
 * is stubbed at fetch, so what's asserted is the text that would have left.
 *
 * The bugs these guard:
 * - a broadcast sent its message exactly as typed, so "{{first_name}}"
 *   reached people literally, though the form said tokens were supported;
 * - tags had to be typed from memory, and a typo matched nobody.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { encrypt } from "../src/lib/crypto";
import { fuzzyFilter, fuzzyScore } from "../src/lib/fuzzy";
import { BROADCAST_TOKENS, renderForContact, tokensIn } from "../src/lib/engine/template";
import { personalise, runBroadcast } from "../src/lib/engine/broadcast";
import { getCustomFieldKeys, getTagCounts } from "../src/lib/queries";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;
type Mutable = { meta: { appId: string; appSecret: string } };
const mutableEnv = env as unknown as Mutable;

export async function runBroadcastFieldChecks(prisma: PrismaClient, check: Check, section: Section) {
  section("Pickers: fuzzy search");
  const tags = ["vip", "hot-lead", "lead", "giveaway-2026", "newsletter"];
  check("a prefix ranks first", fuzzyFilter(tags, "le", (t) => t)[0] === "lead");
  check("a word inside a tag matches", fuzzyFilter(tags, "lead", (t) => t).join() === "lead,hot-lead");
  check("letters in order match (\"vp\" finds vip)", fuzzyFilter(tags, "vp", (t) => t)[0] === "vip");
  check("case doesn't matter", fuzzyScore("VIP", "vip") !== null);
  check("no match is no match", fuzzyFilter(tags, "zzz", (t) => t).length === 0);
  check("an empty search keeps everything, in order", fuzzyFilter(tags, "", (t) => t).join() === tags.join());

  section("Broadcasts: fields filled in per person");
  const contact = { name: "Maya Rao", username: "maya.makes", customFields: { city: "Pune" } };
  check(
    "{{first_name}} and a custom field become this person's values",
    renderForContact("Hey {{first_name}} from {{ city }}!", contact, { username: "shop" }) === "Hey Maya from Pune!",
  );
  check(
    "a field they don't have, or one that only exists in automations, is left blank",
    renderForContact("{{nickname}}{{keyword}}|{{coupon}}", contact, { username: "shop" }) === "|",
  );
  check("first_name falls back to the username", renderForContact("{{first_name}}", { name: null, username: "sam", customFields: {} }, { username: "shop" }) === "sam");
  check("the fields a broadcast offers are the contact's, not a flow's", BROADCAST_TOKENS.map((t) => t.token).join() === "first_name,full_name,username,account_username");
  check("used fields are found for the unknown-field warning", tokensIn("Hi {{first_name}} {{ frist_name }} {{first_name}}").join() === "first_name,frist_name");
  const buttons = personalise(
    { kind: "buttons", text: "Hi {{first_name}}", buttons: [{ type: "web_url", title: "Shop", url: "https://x.example/?u={{username}}" }] },
    contact,
    { username: "shop" },
  );
  check(
    "button messages get their text and links filled in too",
    buttons.kind === "buttons" && buttons.text === "Hi Maya" && buttons.buttons[0].type === "web_url" && buttons.buttons[0].url.endsWith("u=maya.makes"),
  );

  const tag = randomBytes(4).toString("hex");
  const workspace = await prisma.workspace.create({ data: { name: `e2e bcast ${tag}`, slug: `e2e-bcast-${tag}`, planKey: "pro" } });
  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id, igUserId: `e2e_bcast_ig_${tag}`, username: `bcast_${tag}`,
      status: "connected", accessTokenEnc: encrypt("e2e-not-a-real-token"),
    },
  });
  const open = new Date(Date.now() + 3_600_000);
  const people = [
    { igsid: `b1_${tag}`, name: "Maya Rao", tags: ["vip", "lead"], customFields: { city: "Pune" } },
    { igsid: `b2_${tag}`, name: "Sam Lee", tags: ["lead"], customFields: { city: "Goa", plan: "pro" } },
    { igsid: `b3_${tag}`, name: null, username: "quiet.one", tags: ["vip"], customFields: {} },
    { igsid: `b4_${tag}`, name: "Opted Out", tags: ["vip"], customFields: {}, optedOut: true },
  ];
  for (const p of people) {
    await prisma.contact.create({
      data: { accountId: account.id, lastInteractionAt: new Date(), windowExpiresAt: open, ...p },
    });
  }

  const realFetch = globalThis.fetch;
  const bodies: Array<{ to: string; text: string }> = [];
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    if (!String(url).includes("graph.instagram.com")) return realFetch(url, init);
    const body = JSON.parse(String(init?.body ?? "{}"));
    bodies.push({ to: body.recipient?.id, text: body.message?.text ?? "" });
    return new Response(JSON.stringify({ recipient_id: "r", message_id: `m_${bodies.length}` }), { status: 200 });
  }) as typeof fetch;
  const saved = { appId: mutableEnv.meta.appId, appSecret: mutableEnv.meta.appSecret };
  mutableEnv.meta.appId = "e2e-app-id";
  mutableEnv.meta.appSecret = "e2e-app-secret";

  try {
    section("Broadcasts: the tag list");
    const counts = (await getTagCounts([account.id]))[account.id] ?? [];
    check(
      "every tag in use, with how many reachable contacts carry it",
      JSON.stringify(counts) === JSON.stringify([{ tag: "lead", count: 2 }, { tag: "vip", count: 2 }]),
      JSON.stringify(counts),
    );
    const fields = (await getCustomFieldKeys([account.id]))[account.id] ?? [];
    check("and every custom field name, to offer as a field", fields.join() === "city,plan", fields.join());

    section("Broadcasts: what each person receives");
    const segment = await prisma.segment.create({ data: { workspaceId: workspace.id, name: "vip", filter: { tags: ["vip"] } } });
    const broadcast = await prisma.broadcast.create({
      data: {
        workspaceId: workspace.id, accountId: account.id, segmentId: segment.id, name: "e2e",
        payload: { kind: "text", text: "Hey {{first_name}}, the drop is live in {{city}}" }, status: "scheduled",
      },
    });
    await runBroadcast(broadcast.id);
    const byPerson = new Map(bodies.map((b) => [b.to, b.text]));
    check("Maya gets her own name and city", byPerson.get(`b1_${tag}`) === "Hey Maya, the drop is live in Pune", byPerson.get(`b1_${tag}`));
    check(
      "someone with no name gets their username, and a missing field is blank",
      byPerson.get(`b3_${tag}`) === "Hey quiet.one, the drop is live in ",
      byPerson.get(`b3_${tag}`),
    );
    check("nobody receives a literal {{token}}", bodies.every((b) => !b.text.includes("{{")));
    check("only the tagged, reachable people are messaged", bodies.length === 2 && !byPerson.has(`b2_${tag}`) && !byPerson.has(`b4_${tag}`), String(bodies.length));
  } finally {
    globalThis.fetch = realFetch;
    mutableEnv.meta.appId = saved.appId;
    mutableEnv.meta.appSecret = saved.appSecret;
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
}
