import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { recordEvent } from "@/lib/engine/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tracked-link redirector. Records the click, then 302s to the destination.
 *
 * `?c=<contactId>` attributes the click to a person when a flow injected it.
 * Recording must never delay or block the redirect — a broken analytics write
 * should not break the customer's link.
 */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const contactId = new URL(request.url).searchParams.get("c");

  const link = await prisma.trackedLink.findUnique({ where: { code } });
  if (!link) return NextResponse.redirect(new URL("/", env.appUrl));

  try {
    await prisma.trackedLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });

    // Only attribute to a contact that actually exists.
    const contact = contactId
      ? await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, accountId: true } })
      : null;

    await prisma.linkClick.create({
      data: {
        linkId: link.id,
        contactId: contact?.id ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
    });

    if (contact) {
      await recordEvent({
        accountId: contact.accountId,
        contactId: contact.id,
        type: "link_clicked",
        meta: { code },
      });
    }
  } catch (error) {
    console.error("[tracked-link] could not record click", error);
  }

  return NextResponse.redirect(link.destination);
}
