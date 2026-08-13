import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { csvCell, errorResponse } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { getAccountIds } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact export. `?format=xlsx` produces a real Excel workbook (SendDM's
 * "download as Excel"); the default is CSV.
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const format = new URL(request.url).searchParams.get("format") ?? "csv";

    const accountIds = await getAccountIds(workspace.id);
    const contacts = await prisma.contact.findMany({
      where: { accountId: { in: accountIds } },
      include: { account: { select: { username: true } } },
      orderBy: { lastInteractionAt: "desc" },
    });

    // Union of every custom field key so the sheet has stable columns.
    const customKeys = [
      ...new Set(
        contacts.flatMap((c) => Object.keys((c.customFields as Record<string, unknown>) ?? {})),
      ),
    ].sort();

    const headers = [
      "Instagram username",
      "Name",
      "Instagram-scoped ID",
      "Account",
      "Tags",
      "Follows you",
      "Opted out",
      "First seen",
      "Last interaction",
      "Messaging window expires",
      ...customKeys,
    ];

    const rows = contacts.map((contact) => {
      const fields = (contact.customFields as Record<string, unknown>) ?? {};
      return [
        contact.username ?? "",
        contact.name ?? "",
        contact.igsid,
        contact.account.username,
        contact.tags.join(", "),
        contact.isFollower === null ? "unknown" : contact.isFollower ? "yes" : "no",
        contact.optedOut ? "yes" : "no",
        contact.firstSeenAt.toISOString(),
        contact.lastInteractionAt?.toISOString() ?? "",
        contact.windowExpiresAt?.toISOString() ?? "",
        ...customKeys.map((key) => String(fields[key] ?? "")),
      ];
    });

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "InstaDM247";
      const sheet = workbook.addWorksheet("Contacts");

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
          "Content-Disposition": `attachment; filename="contacts-${stamp}.xlsx"`,
        },
      });
    }

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-${stamp}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
