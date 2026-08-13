import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { errorResponse, csvCell } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Export a lead form's responses. `?format=xlsx` gives a real Excel workbook. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireWorkspace();
    const { id } = await context.params;
    const format = new URL(request.url).searchParams.get("format") ?? "csv";

    const form = await prisma.leadForm.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        responses: {
          include: { contact: { select: { username: true, name: true, igsid: true, tags: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!form) return new Response("Not found", { status: 404 });

    const fields = (form.fields as Array<{ id: string; label: string }>) ?? [];
    const headers = [
      "Instagram username",
      "Name",
      "Tags",
      "Completed",
      "Submitted at",
      ...fields.map((f) => f.label),
    ];

    const rows = form.responses.map((response) => {
      const answers = (response.answers as Record<string, unknown>) ?? {};
      return [
        response.contact.username ?? "",
        response.contact.name ?? "",
        response.contact.tags.join(", "),
        response.completed ? "yes" : "no",
        response.createdAt.toISOString(),
        ...fields.map((f) => String(answers[f.id] ?? "")),
      ];
    });

    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "InstaDM247";
      const sheet = workbook.addWorksheet("Responses");

      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
      for (const row of rows) sheet.addRow(row);
      sheet.columns.forEach((column) => {
        column.width = 22;
      });
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${slug}-${stamp}.xlsx"`,
        },
      });
    }

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${stamp}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
