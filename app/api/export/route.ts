import { buildXlsx } from "@/lib/xlsx/export";
import { TEMPLATE_B64 } from "@/lib/xlsx/template-data";
import { getRowsForExport } from "@/db/queries";

export const runtime = "nodejs";

export async function GET() {
  const rows = await getRowsForExport();
  const bytes = buildXlsx(Buffer.from(TEMPLATE_B64, "base64"), rows);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="pcn-register.xlsx"',
    },
  });
}
