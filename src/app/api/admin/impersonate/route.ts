import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, requirePlatformStaff } from "@/lib/admin";
import { startImpersonation, stopImpersonation } from "@/lib/impersonation";

export const runtime = "nodejs";

const schema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  reason: z.string().min(3).max(300),
});

export async function POST(request: Request) {
  try {
    const staff = await requirePlatformStaff("support");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "A reason is required." }, { status: 400 });
    }
    const { workspaceId, userId, reason } = parsed.data;

    // The target must really belong to the workspace being investigated — this
    // stops a workspace id being used to reach an unrelated account.
    const membership = await prisma.membership.findFirst({ where: { workspaceId, userId } });
    if (!membership) {
      return NextResponse.json({ error: "That user is not in this workspace." }, { status: 400 });
    }

    // Refuse to impersonate other platform staff: it would let one staff
    // account borrow another's, and muddy who did what in the audit log.
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
    if (target && target.platformRole !== "none") {
      return NextResponse.json({ error: "Platform staff cannot be impersonated." }, { status: 400 });
    }

    await startImpersonation({ staffUserId: staff.id, targetUserId: userId, reason, workspaceId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    console.error("[admin] impersonate failed", error);
    return NextResponse.json({ error: "Could not start the session." }, { status: 500 });
  }
}

/** Ending impersonation needs no privileges — anyone in one should be able to leave. */
export async function DELETE() {
  await stopImpersonation();
  return NextResponse.json({ ok: true });
}
