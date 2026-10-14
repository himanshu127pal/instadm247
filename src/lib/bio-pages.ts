import type { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkSlug, REDIRECT_DAYS } from "@/lib/bio-slug";
import { isBranded } from "@/lib/branding";
import type { bioPageSchema } from "@/lib/bio-schema";

/**
 * Saving a link-in-bio page, with the rules that keep links fair. See
 * docs/BIO.md §One link per account.
 *
 * - One page per Instagram account, and the account must be the
 *   workspace's own. So a workspace has at most as many links as it has
 *   connected accounts, which its plan already limits.
 * - Changing a page's link keeps the old one redirecting (and reserved) for
 *   REDIRECT_DAYS. Only the latest old link is kept, so renaming over and
 *   over can't stockpile addresses.
 * - Blocks and tabs are only ever updated if they belong to this page; an id
 *   from anywhere else is ignored.
 */

export type BioPageInput = z.infer<typeof bioPageSchema>;
export type SaveResult =
  | { ok: true; pageId: string; blockIds: string[]; tabIds: Array<{ key: string; id: string }> }
  | { ok: false; status: number; error: string; pageId?: string };

export async function saveBioPage(workspace: { id: string; planKey: string }, body: BioPageInput): Promise<SaveResult> {
  const existing = body.id
    ? await prisma.bioPage.findFirst({ where: { id: body.id, workspaceId: workspace.id } })
    : null;
  if (body.id && !existing) return { ok: false, status: 404, error: "Page not found." };

  // The account: required, ours, and without a page of its own already. An
  // old page that never had one may stay without.
  const accountId = body.accountId || null;
  if (!accountId && !(existing && existing.accountId === null)) {
    return { ok: false, status: 400, error: "Pick the Instagram account this page is for." };
  }
  if (accountId) {
    const account = await prisma.instagramAccount.findFirst({
      where: { id: accountId, workspaceId: workspace.id },
      select: { username: true, bioPage: { select: { id: true } } },
    });
    if (!account) return { ok: false, status: 400, error: "That Instagram account isn't connected to this workspace." };
    if (account.bioPage && account.bioPage.id !== existing?.id) {
      return {
        ok: false,
        status: 409,
        error: `@${account.username} already has a page. Each account gets one link: add a tab to that page instead.`,
        pageId: account.bioPage.id,
      };
    }
  }

  // Slugs are global. Same rules as the live check in the editor.
  const slugCheck = await checkSlug(body.slug, existing?.id ?? null);
  if (!slugCheck.available) return { ok: false, status: 409, error: slugCheck.reason };

  // On Free the badge is always shown, so the switch is locked in the editor.
  // Keep whatever was saved before rather than taking a value the customer
  // couldn't have chosen; it applies again if they upgrade.
  const showBadge = isBranded(workspace) ? (existing?.showBadge ?? true) : body.showBadge;

  const data = {
    slug: body.slug,
    title: body.title,
    bio: body.bio ?? null,
    avatarUrl: body.avatarUrl ?? null,
    theme: body.theme,
    design: body.design ?? Prisma.DbNull,
    homeLabel: body.homeLabel,
    published: body.published,
    showBadge,
    accountId,
  };

  try {
    return await prisma.$transaction(async (tx) => {
      // An expired redirect, or this page's own old link, gives way to the
      // page that takes the address.
      await tx.bioRedirect.deleteMany({ where: { slug: body.slug } });

      let pageId: string;
      if (existing) {
        if (existing.slug !== body.slug) {
          // Only the latest old link keeps redirecting.
          await tx.bioRedirect.deleteMany({ where: { pageId: existing.id, reason: "renamed" } });
          await tx.bioRedirect.create({
            data: { slug: existing.slug, pageId: existing.id, reason: "renamed", expiresAt: new Date(Date.now() + REDIRECT_DAYS * 864e5) },
          });
        }
        await tx.bioPage.update({ where: { id: existing.id }, data });
        pageId = existing.id;
      } else {
        pageId = (await tx.bioPage.create({ data: { ...data, workspaceId: workspace.id } })).id;
      }

      // Tabs. Ids not on this page are treated as new. Kept tabs park on a
      // temporary slug first, so two tabs can swap links without clashing.
      const ownTabs = new Set((await tx.bioTab.findMany({ where: { pageId }, select: { id: true } })).map((t) => t.id));
      const keptTabs = body.tabs.map((t) => t.id).filter((id): id is string => !!id && ownTabs.has(id));
      await tx.bioTab.deleteMany({ where: { pageId, id: { notIn: keptTabs } } });
      for (const id of keptTabs) await tx.bioTab.update({ where: { id }, data: { slug: `__moving-${id}` } });
      const tabIds: Array<{ key: string; id: string }> = [];
      for (const [order, tab] of body.tabs.entries()) {
        const fields = { slug: tab.slug, label: tab.label, enabled: tab.enabled, order };
        const id = tab.id && ownTabs.has(tab.id)
          ? (await tx.bioTab.update({ where: { id: tab.id }, data: fields })).id
          : (await tx.bioTab.create({ data: { ...fields, pageId } })).id;
        tabIds.push({ key: tab.key, id });
      }
      const tabId = new Map(tabIds.map((t) => [t.key, t.id]));

      // Blocks: replaced wholesale, but a block that survived the edit keeps
      // its id and so its tap history.
      const ownBlocks = new Set((await tx.bioBlock.findMany({ where: { pageId }, select: { id: true } })).map((b) => b.id));
      const keptBlocks = body.blocks.map((b) => b.id).filter((id): id is string => !!id && ownBlocks.has(id));
      await tx.bioBlock.deleteMany({ where: { pageId, id: { notIn: keptBlocks } } });
      const blockIds: string[] = [];
      const order = new Map<string, number>();
      for (const block of body.blocks) {
        const tab = block.tab ? tabId.get(block.tab) ?? null : null;
        const n = order.get(tab ?? "") ?? 0;
        order.set(tab ?? "", n + 1);
        const fields = {
          kind: block.kind,
          label: block.label,
          url: block.url ?? null,
          subtitle: block.subtitle ?? null,
          imageUrl: block.imageUrl ?? null,
          enabled: block.enabled,
          tabId: tab,
          order: n,
        };
        const id = block.id && ownBlocks.has(block.id)
          ? (await tx.bioBlock.update({ where: { id: block.id }, data: fields })).id
          : (await tx.bioBlock.create({ data: { ...fields, pageId } })).id;
        blockIds.push(id);
      }

      return { ok: true as const, pageId, blockIds, tabIds };
    });
  } catch (error) {
    // Two people claiming the same free link (or account) at once: the check
    // passed for both, and a unique index let only one through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, status: 409, error: `/l/${body.slug} was just taken. Try another.` };
    }
    throw error;
  }
}

/**
 * When an account is connected and has no page, it takes over the
 * workspace's oldest page that lost its account (one whose account was
 * removed). Removing and reconnecting an account therefore can't mint a
 * second link.
 */
export async function adoptOrphanBioPage(workspaceId: string, accountId: string): Promise<void> {
  const has = await prisma.bioPage.findUnique({ where: { accountId }, select: { id: true } });
  if (has) return;
  const orphan = await prisma.bioPage.findFirst({ where: { workspaceId, accountId: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (orphan) await prisma.bioPage.update({ where: { id: orphan.id }, data: { accountId } }).catch(() => undefined);
}

/**
 * Where an old address goes now, if it still redirects: a page's previous
 * link (`tab` null), or a page merged into another as a tab. Null when it
 * doesn't.
 */
export async function resolveBioRedirect(slug: string): Promise<{ page: string; tab: string | null } | null> {
  const redirect = await prisma.bioRedirect.findUnique({
    where: { slug },
    include: { page: { select: { slug: true, tabs: { select: { id: true, slug: true } } } } },
  });
  if (!redirect || redirect.expiresAt <= new Date()) return null;
  const tab = redirect.tabId ? redirect.page.tabs.find((t) => t.id === redirect.tabId) : null;
  return { page: redirect.page.slug, tab: tab?.slug ?? null };
}
