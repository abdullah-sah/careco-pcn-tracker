import type { PcnSelect } from "@/db/schema";

const RESEND_URL = "https://api.resend.com/emails";
const ALI_EMAIL = "abd.sahraoui26@gmail.com"; // temporary — Ali's real address later
const FROM_FALLBACK = "PCN Register <onboarding@resend.dev>";

export interface PcnImageAttachment {
  base64: string;
  contentType: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function gbp(p: number | null): string {
  return p == null ? "—" : "£" + (p / 100).toFixed(2).replace(/\.00$/, "");
}

// Driver name deliberately omitted: Ali doesn't need it (data minimisation).
function buildHtml(row: PcnSelect): string {
  const rows: [string, string][] = [
    ["PCN number", row.pcnNumber],
    ["Issuing authority", row.authority],
    ["Vehicle reg", row.vehicleReg],
    ["Date of PCN", row.dateOfPcn ?? "—"],
    ["Full cost", gbp(row.fullCostPence)],
    ["Discounted cost", gbp(row.discountedCostPence)],
    ["Discount period", row.discountPeriodDays != null ? `${row.discountPeriodDays} days` : "—"],
  ];
  const trs = rows
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#777">${k}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`)
    .join("");
  return `<p>Hi Ali,</p><p>Please find attached a new PCN to resolve:</p><table style="border-collapse:collapse;font-size:14px">${trs}</table><p>The ticket image is attached.</p>`;
}

export async function sendPcnEmail(row: PcnSelect, image: PcnImageAttachment): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Email isn't set up yet (missing RESEND_API_KEY).");
  const ext = image.contentType === "image/png" ? "png" : "jpg";
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? FROM_FALLBACK,
      to: [process.env.ALI_EMAIL ?? ALI_EMAIL],
      subject: `PCN ${row.pcnNumber} — ${row.authority} (${row.vehicleReg})`,
      html: buildHtml(row),
      attachments: [{ filename: `pcn-${row.pcnNumber.replace(/[^A-Za-z0-9-]/g, "_")}.${ext}`, content: image.base64 }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Resend send failed:", res.status, body);
    throw new Error("Email couldn't be sent — try again.");
  }
}
