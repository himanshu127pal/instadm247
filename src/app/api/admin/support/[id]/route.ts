import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, audit, requirePlatformStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { SupportError, TICKET_STATUS, setTicketStatus, staffReply } from "@/lib/support";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (error instanceof SupportError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[admin] support action failed", error);
  return NextResponse.json({ error: "Could not save that." }, { status: 500 });
}

/** Reply to a ticket as staff. The customer is emailed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const staff = await requirePlatformStaff("support");
    const { id } = await params;
    const parsed = z.object({ body: z.string().trim().min(1).max(5000) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { workspaceId: true } });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    await audit({ actorUserId: staff.id, action: "support.reply", targetType: "workspace", targetId: ticket.workspaceId, meta: { ticketId: id } });
    await staffReply(staff, id, parsed.data.body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/** Change a ticket's status. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformStaff("support");
    const { id } = await params;
    const parsed = z
      .object({ status: z.enum(Object.keys(TICKET_STATUS) as [keyof typeof TICKET_STATUS, ...Array<keyof typeof TICKET_STATUS>]) })
      .safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    await setTicketStatus(id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
