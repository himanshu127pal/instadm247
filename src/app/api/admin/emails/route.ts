import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, audit, requirePlatformStaff } from "@/lib/admin";
import { enqueue } from "@/lib/engine/queues";
import { deliverEmail } from "@/lib/email/send";

export const runtime = "nodejs";

const schema = z.object({ action: z.literal("retry"), id: z.string().min(1) });

/**
 * Send a failed email again — after SES was misconfigured, say. Only mail
 * whose inputs were kept can be rebuilt; a verification or reset link never
 * is, and the customer asks for a fresh one instead.
 */
export async function POST(request: Request) {
  try {
    const staff = await requirePlatformStaff("support");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    const row = await prisma.emailMessage.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, status: true, params: true, template: true, workspaceId: true },
    });
    if (!row) return NextResponse.json({ error: "No such email." }, { status: 404 });
    if (row.status !== "failed") {
      return NextResponse.json({ error: `It's ${row.status}, not failed.` }, { status: 409 });
    }
    if (row.params === null) {
      return NextResponse.json(
        { error: "This one held a sign-in or reset link, which we never keep. The customer can ask for a new one." },
        { status: 409 },
      );
    }

    await audit({
      actorUserId: staff.id,
      action: "email.retry",
      targetType: "email",
      targetId: row.id,
      meta: { template: row.template, workspaceId: row.workspaceId },
    });

    // Conditional, so two clicks can't send it twice.
    const claimed = await prisma.emailMessage.updateMany({
      where: { id: row.id, status: "failed" },
      data: { status: "queued", error: null },
    });
    if (claimed.count === 0) return NextResponse.json({ ok: true, status: "queued" });

    const queued = await enqueue("email", "send", { emailMessageId: row.id });
    const result = queued ? { status: "queued" } : await deliverEmail(row.id);
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    console.error("[admin] email retry failed", error);
    return NextResponse.json({ error: "Could not retry the email." }, { status: 500 });
  }
}
