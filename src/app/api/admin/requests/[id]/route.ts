import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, requirePlatformStaff } from "@/lib/admin";
import { REQUEST_STATUS, SupportError, updateFeatureRequest, type RequestStatus } from "@/lib/support";

export const runtime = "nodejs";

/** Set a feature request's status and the note the customer sees. They're emailed on a change. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformStaff("support");
    const { id } = await params;
    const parsed = z
      .object({
        status: z.enum(Object.keys(REQUEST_STATUS) as [RequestStatus, ...RequestStatus[]]),
        staffNote: z.string().max(2000).nullable().optional(),
      })
      .safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    await updateFeatureRequest(id, { status: parsed.data.status, staffNote: parsed.data.staffNote ?? null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminAccessError) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    if (error instanceof SupportError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[admin] request update failed", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
