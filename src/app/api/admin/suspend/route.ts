import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, audit, requirePlatformStaff } from "@/lib/admin";
import { notifySuspension } from "@/lib/email/notify";

export const runtime = "nodejs";

const schema = z.object({
  workspaceId: z.string().min(1),
  suspended: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    // Suspending stops a paying customer's traffic, so it is admin-only.
    const staff = await requirePlatformStaff("admin");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const { workspaceId, suspended, reason } = parsed.data;

    if (suspended && (reason ?? "").trim().length < 10) {
      return NextResponse.json(
        { error: "Give a reason of at least 10 characters — the customer reads it." },
        { status: 400 },
      );
    }

    const before = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { suspendedAt: true } });
    if (!before) return NextResponse.json({ error: "No such customer." }, { status: 404 });

    await audit({
      actorUserId: staff.id,
      action: suspended ? "workspace.suspend" : "workspace.unsuspend",
      targetType: "workspace",
      targetId: workspaceId,
      reason: reason?.trim(),
    });

    const at = new Date();
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: suspended
        ? { suspendedAt: at, suspendedReason: reason!.trim(), suspendedById: staff.id }
        : { suspendedAt: null, suspendedReason: null, suspendedById: null },
    });

    // Drop their sessions so the notice is seen immediately rather than
    // whenever the current session happens to expire.
    if (suspended) {
      const members = await prisma.membership.findMany({
        where: { workspaceId },
        select: { userId: true },
      });
      await prisma.session.deleteMany({ where: { userId: { in: members.map((m) => m.userId) } } });
    }

    // Tell the owner — the reason is the one they'd see at sign-in. Only on an
    // actual change, so re-saving a suspension doesn't email again.
    if (suspended !== Boolean(before.suspendedAt)) {
      await notifySuspension(workspaceId, suspended, reason?.trim() ?? null, at).catch((error) =>
        console.error("[admin] suspension email failed", error),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    console.error("[admin] suspend failed", error);
    return NextResponse.json({ error: "Could not update the customer." }, { status: 500 });
  }
}
