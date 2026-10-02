/**
 * Editing contacts' tags by hand, and keeping a collected answer on the
 * contact. Run from e2e-check.ts.
 *
 * Before this, tags could only come from a Tag step, and an answer from Ask a
 * question lived only in its run, so a broadcast couldn't use {{email}}.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeTag, updateContactTags } from "../src/lib/contacts";
import { handleEvent } from "../src/lib/engine/ingest";
import type { NormalizedEvent } from "../src/lib/meta/types";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export async function runContactTagChecks(prisma: PrismaClient, check: Check, section: Section) {
  section("Contacts: tags by hand");
  check("a typed tag is trimmed and keeps its case", normalizeTag("  Hot   Lead ") === "Hot Lead");
  check("commas can't split a tag", normalizeTag("vip,gold") === "vipgold");
  check("blank isn't a tag", normalizeTag("   ") === "");

  const tag = randomBytes(4).toString("hex");
  const mine = await prisma.workspace.create({ data: { name: `e2e tags ${tag}`, slug: `e2e-tags-${tag}`, planKey: "pro" } });
  const theirs = await prisma.workspace.create({ data: { name: `e2e tags o ${tag}`, slug: `e2e-tags-o-${tag}`, planKey: "pro" } });
  const account = await prisma.instagramAccount.create({
    data: { workspaceId: mine.id, igUserId: `e2e_tags_ig_${tag}`, username: `tags_${tag}`, status: "demo" },
  });
  const otherAccount = await prisma.instagramAccount.create({
    data: { workspaceId: theirs.id, igUserId: `e2e_tags_o_ig_${tag}`, username: `tags_o_${tag}`, status: "demo" },
  });
  const a = await prisma.contact.create({ data: { accountId: account.id, igsid: `t_a_${tag}`, tags: ["lead"] } });
  const b = await prisma.contact.create({ data: { accountId: account.id, igsid: `t_b_${tag}`, tags: [] } });
  const stranger = await prisma.contact.create({ data: { accountId: otherAccount.id, igsid: `t_s_${tag}`, tags: [] } });
  const tagsOf = async (id: string) => (await prisma.contact.findUniqueOrThrow({ where: { id } })).tags;

  try {
    const added = await updateContactTags(mine.id, [a.id, b.id, stranger.id], { add: [" vip ", "lead"] });
    const sorted = async (id: string) => [...(await tagsOf(id))].sort().join();
    check("a tag is added to every picked contact", (await sorted(a.id)) === "lead,vip" && (await sorted(b.id)) === "lead,vip", `${await tagsOf(a.id)} / ${await tagsOf(b.id)}`);
    check("without doubling a tag someone already had", (await tagsOf(a.id)).filter((t) => t === "lead").length === 1);
    check("another workspace's contact is never touched", (await tagsOf(stranger.id)).length === 0 && added === 2, String(added));
    await updateContactTags(mine.id, [a.id], { remove: ["lead"] });
    check("a tag can be removed from one contact", (await tagsOf(a.id)).join() === "vip" && (await tagsOf(b.id)).includes("lead"));
    check("a change that changes nothing reports nothing", (await updateContactTags(mine.id, [a.id], { add: ["vip"] })) === 0);
    check("blank tags are ignored", (await updateContactTags(mine.id, [a.id], { add: ["  "] })) === 0);

    section("Ask a question: save the answer to the contact");
    const flow = (contactField?: string) => ({
      nodes: [
        { id: "t", type: "TRIGGER", position: { x: 0, y: 0 }, data: { label: "Start" } },
        {
          id: "q", type: "COLLECT_INPUT", position: { x: 0, y: 160 },
          data: { label: "Email", prompt: "Your email?", variable: "email", fieldType: "email", timeoutMinutes: 60, ...(contactField ? { contactField } : {}) },
        },
        { id: "e", type: "END", position: { x: 0, y: 320 }, data: { label: "Done" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "q", sourceHandle: "next" },
        { id: "e2", source: "q", target: "e", sourceHandle: "next" },
      ],
    });
    const make = (keyword: string, contactField?: string) =>
      prisma.automation.create({
        data: {
          accountId: account.id, name: `e2e ask ${keyword}`, triggerType: "DM_KEYWORD", scope: "UNIVERSAL", matchMode: "KEYWORD",
          keywords: [keyword], enabled: true, reentryPolicy: "ALWAYS",
          flow: { create: { name: keyword, nodes: flow(contactField).nodes as object[], edges: flow(contactField).edges as object[] } },
        },
      });
    await make("JOIN", "email");
    await make("QUIZ");

    let n = 0;
    const dm = (igsid: string, text: string): NormalizedEvent => ({
      dedupeKey: `e2e_ask_${tag}_${++n}`, igUserId: account.igUserId, kind: "DM_KEYWORD", igsid, text,
      timestamp: new Date(), messageId: `e2e_ask_mid_${tag}_${n}`, raw: {},
    });
    await handleEvent(dm(`ask1_${tag}`, "JOIN"));
    await handleEvent(dm(`ask1_${tag}`, "maya@example.com"));
    const saved = await prisma.contact.findFirstOrThrow({ where: { accountId: account.id, igsid: `ask1_${tag}` } });
    check(
      "with Save to the contact on, the answer is kept as a custom field",
      (saved.customFields as Record<string, unknown>).email === "maya@example.com",
      JSON.stringify(saved.customFields),
    );
    await handleEvent(dm(`ask2_${tag}`, "QUIZ"));
    await handleEvent(dm(`ask2_${tag}`, "sam@example.com"));
    const notSaved = await prisma.contact.findFirstOrThrow({ where: { accountId: account.id, igsid: `ask2_${tag}` } });
    const run = await prisma.flowRun.findFirstOrThrow({ where: { contactId: notSaved.id } });
    check(
      "with it off, the answer stays in the run only",
      !("email" in (notSaved.customFields as Record<string, unknown>)) && (run.variables as Record<string, unknown>).email === "sam@example.com",
      JSON.stringify(notSaved.customFields),
    );
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [mine.id, theirs.id] } } }).catch(() => undefined);
  }
}
