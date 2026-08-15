import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, audit, requirePlatformStaff } from "@/lib/admin";

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

    await audit({
      actorUserId: staff.id,
      action: suspended ? "workspace.suspend" : "workspace.unsuspend",
      targetType: "workspace",
      targetId: workspaceId,
      reason: reason?.trim(),
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: suspended
        ? { suspendedAt: new Date(), suspendedReason: reason!.trim(), suspendedById: staff.id }
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    console.error("[admin] suspend failed", error);
    return NextResponse.json({ error: "Could not update the customer." }, { status: 500 });
  }
}
