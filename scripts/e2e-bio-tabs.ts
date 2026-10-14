/**
 * One link-in-bio page per Instagram account, with tabs inside it. Run from
 * e2e-check.ts.
 *
 * What these guard (owner's call: stop people claiming every rare link):
 * - a workspace gets one link per connected account, and only for its own
 *   accounts;
 * - an old link keeps redirecting, and stays reserved, for a while, but
 *   renaming over and over can't stockpile addresses;
 * - saving never touches a block or tab that belongs to another page;
 * - tabs can swap links without tripping the unique index.
 */

import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { adoptOrphanBioPage, resolveBioRedirect, saveBioPage, type BioPageInput } from "../src/lib/bio-pages";
import { bioPageSchema } from "../src/lib/bio-schema";
import { checkSlug } from "../src/lib/bio-slug";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

export async function runBioTabChecks(prisma: PrismaClient, check: Check, section: Section) {
  section("Link in bio: one link per account");
  const tag = randomBytes(4).toString("hex");
  const mine = await prisma.workspace.create({ data: { name: `e2e tabs ${tag}`, slug: `e2e-tabs-${tag}`, planKey: "pro" } });
  const theirs = await prisma.workspace.create({ data: { name: `e2e tabs o ${tag}`, slug: `e2e-tabs-o-${tag}`, planKey: "pro" } });
  const account = await prisma.instagramAccount.create({ data: { workspaceId: mine.id, igUserId: `e2e_tabs_${tag}`, username: `tabs_${tag}`, status: "demo" } });
  const second = await prisma.instagramAccount.create({ data: { workspaceId: mine.id, igUserId: `e2e_tabs2_${tag}`, username: `tabs2_${tag}`, status: "demo" } });
  const stranger = await prisma.instagramAccount.create({ data: { workspaceId: theirs.id, igUserId: `e2e_tabs_o_${tag}`, username: `tabs_o_${tag}`, status: "demo" } });
  const input = (over: Partial<z.input<typeof bioPageSchema>>): BioPageInput => bioPageSchema.parse({ slug: `e2e-tabs-${tag}`, title: "Tabs", ...over });

  try {
    const first = await saveBioPage(mine, input({ accountId: account.id, blocks: [{ kind: "LINK", label: "Home link", url: "https://example.com" }] }));
    check("a page can be made for an account", first.ok);
    const pageId = first.ok ? first.pageId : "";

    const again = await saveBioPage(mine, input({ slug: `e2e-tabs-b-${tag}`, accountId: account.id }));
    check(
      "a second page for the same account is refused, pointing at the first",
      !again.ok && again.status === 409 && again.pageId === pageId && /add a tab/i.test(again.error),
    );
    const borrowed = await saveBioPage(mine, input({ slug: `e2e-tabs-c-${tag}`, accountId: stranger.id }));
    check("a page can't use another workspace's account", !borrowed.ok && borrowed.status === 400);
    const none = await saveBioPage(mine, input({ slug: `e2e-tabs-d-${tag}`, accountId: null }));
    check("a new page needs an account", !none.ok && none.status === 400);

    section("Link in bio: tabs");
    const withTabs = await saveBioPage(
      mine,
      input({
        id: pageId,
        accountId: account.id,
        homeLabel: "Links",
        tabs: [
          { key: "t1", label: "Shop", slug: "shop", enabled: true },
          { key: "t2", label: "About", slug: "about", enabled: false },
        ],
        blocks: [
          { kind: "SOCIAL", label: "instagram", url: "https://instagram.com/x" },
          { kind: "LINK", label: "Home link", url: "https://example.com" },
          { kind: "PRODUCT", label: "Mug", url: "https://example.com/mug", tab: "t1" },
          { kind: "TEXT", label: "Hello", tab: "t2" },
        ],
      }),
    );
    const tabs = await prisma.bioTab.findMany({ where: { pageId }, orderBy: { order: "asc" } });
    const blocks = await prisma.bioBlock.findMany({ where: { pageId }, include: { tab: true } });
    check(
      "tabs save with their own blocks",
      withTabs.ok && tabs.map((t) => t.slug).join() === "shop,about" && blocks.find((b) => b.label === "Mug")?.tab?.slug === "shop" && blocks.find((b) => b.label === "Home link")?.tabId === null,
    );
    const mug = blocks.find((b) => b.label === "Mug")!;
    await prisma.bioBlock.update({ where: { id: mug.id }, data: { clickCount: 9 } });

    // Swap the two tabs' links, and keep the blocks.
    const ids = withTabs.ok ? Object.fromEntries(withTabs.tabIds.map((t) => [t.key, t.id])) : {};
    const swapped = await saveBioPage(
      mine,
      input({
        id: pageId,
        accountId: account.id,
        tabs: [
          { key: ids.t1, id: ids.t1, label: "Shop", slug: "about", enabled: true },
          { key: ids.t2, id: ids.t2, label: "About", slug: "shop", enabled: true },
        ],
        blocks: blocks.map((b) => ({ id: b.id, kind: b.kind as never, label: b.label, url: b.url, tab: b.tabId })),
      }),
    );
    const after = await prisma.bioTab.findUnique({ where: { id: ids.t1 } });
    const mugAfter = await prisma.bioBlock.findUnique({ where: { id: mug.id } });
    check("two tabs can swap links", swapped.ok && after?.slug === "about", swapped.ok ? undefined : swapped.error);
    check("a block that survives a save keeps its taps", mugAfter?.clickCount === 9);

    await prisma.bioRedirect.create({ data: { slug: `e2e-tabs-merged-${tag}`, pageId, tabId: ids.t2, reason: "merged", expiresAt: new Date(Date.now() + 864e5) } });
    const merged = await resolveBioRedirect(`e2e-tabs-merged-${tag}`);
    check("a merged page's old link goes to its tab", merged?.page === `e2e-tabs-${tag}` && merged.tab === "shop", JSON.stringify(merged));

    // Someone else's block id is never written to.
    const otherPage = await prisma.bioPage.create({ data: { workspaceId: theirs.id, accountId: stranger.id, slug: `e2e-tabs-o-${tag}`, title: "Theirs" } });
    const victim = await prisma.bioBlock.create({ data: { pageId: otherPage.id, kind: "LINK", label: "Theirs", url: "https://example.org" } });
    await saveBioPage(mine, input({ id: pageId, accountId: account.id, blocks: [{ id: victim.id, kind: "LINK", label: "Hijacked", url: "https://evil.example" }] }));
    const victimAfter = await prisma.bioBlock.findUnique({ where: { id: victim.id } });
    check("saving can't change another page's block", victimAfter?.label === "Theirs" && victimAfter.pageId === otherPage.id);

    const bad = (body: unknown) => !bioPageSchema.safeParse({ slug: "x-ok", title: "T", ...(body as object) }).success;
    check("two tabs can't share a link", bad({ tabs: [{ key: "a", label: "A", slug: "s" }, { key: "b", label: "B", slug: "s" }] }));
    check("social icons only go on the first tab", bad({ tabs: [{ key: "a", label: "A", slug: "a" }], blocks: [{ kind: "SOCIAL", label: "x", url: "https://x.com/me", tab: "a" }] }));
    check("a block can't be on a tab that doesn't exist", bad({ blocks: [{ kind: "TEXT", label: "Hi", tab: "nope" }] }));

    section("Link in bio: old links");
    const renamed = await saveBioPage(mine, input({ id: pageId, slug: `e2e-tabs-new-${tag}`, accountId: account.id }));
    check("a page can change its link", renamed.ok);
    const held = await checkSlug(`e2e-tabs-${tag}`);
    check("its old link stays reserved for everyone else", !held.available);
    check("the page itself can take its old link back", (await checkSlug(`e2e-tabs-${tag}`, pageId)).available);
    const to = await resolveBioRedirect(`e2e-tabs-${tag}`);
    check("the old link redirects to the new one", to?.page === `e2e-tabs-new-${tag}` && to.tab === null);

    await saveBioPage(mine, input({ id: pageId, slug: `e2e-tabs-newer-${tag}`, accountId: account.id }));
    check(
      "renaming again frees the oldest link: only the latest one is kept",
      (await checkSlug(`e2e-tabs-${tag}`)).available && !(await checkSlug(`e2e-tabs-new-${tag}`)).available,
    );

    await prisma.bioRedirect.update({ where: { slug: `e2e-tabs-new-${tag}` }, data: { expiresAt: new Date(Date.now() - 1000) } });
    check("an expired old link is free again", (await checkSlug(`e2e-tabs-new-${tag}`)).available && (await resolveBioRedirect(`e2e-tabs-new-${tag}`)) === null);
    const claim = await saveBioPage(mine, input({ slug: `e2e-tabs-new-${tag}`, accountId: second.id }));
    check("and someone can claim it", claim.ok, claim.ok ? undefined : claim.error);

    const orphaned = await resolveBioRedirect(`e2e-tabs-merged-${tag}`);
    check("once that tab is deleted, the old link goes to the page", orphaned?.page === `e2e-tabs-newer-${tag}` && orphaned.tab === null, JSON.stringify(orphaned));

    section("Link in bio: removed accounts");
    await prisma.bioPage.update({ where: { id: pageId }, data: { accountId: null } });
    const third = await prisma.instagramAccount.create({ data: { workspaceId: mine.id, igUserId: `e2e_tabs3_${tag}`, username: `tabs3_${tag}`, status: "demo" } });
    await adoptOrphanBioPage(mine.id, third.id);
    check(
      "a page whose account was removed goes to the next account connected",
      (await prisma.bioPage.findUnique({ where: { id: pageId } }))?.accountId === third.id,
    );
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: [mine.id, theirs.id] } } });
  }
}
