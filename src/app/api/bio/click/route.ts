import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a Link-in-Bio block click.
 *
 * Public and unauthenticated — the page it serves is public. It only ever
 * increments a counter for a block id that already exists, so the worst a
 * bad actor can do is inflate someone's own click count.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { blockId?: string };
    if (!body.blockId) return NextResponse.json({ ok: false }, { status: 400 });

    const block = await prisma.bioBlock.findUnique({
      where: { id: body.blockId },
      select: { id: true },
    });
    if (!block) return NextResponse.json({ ok: false }, { status: 404 });

    await prisma.$transaction([
      prisma.bioBlock.update({
        where: { id: block.id },
        data: { clickCount: { increment: 1 } },
      }),
      prisma.bioBlockClick.create({
        data: {
          blockId: block.id,
          referrer: request.headers.get("referer")?.slice(0, 300) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[bio] click tracking failed", error);
    // Never surface an error to a visitor mid-navigation.
    return NextResponse.json({ ok: false });
  }
}
