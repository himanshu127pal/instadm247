import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AdminAccessError, requirePlatformStaff } from "@/lib/admin";

export const runtime = "nodejs";

const schema = z.object({ workspaceId: z.string().min(1), body: z.string().min(2).max(4000) });

export async function POST(request: Request) {
  try {
    const staff = await requirePlatformStaff("support");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    await prisma.adminNote.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        authorId: staff.id,
        body: parsed.data.body.trim(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    console.error("[admin] note failed", error);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
