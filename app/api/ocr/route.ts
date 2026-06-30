import { put } from "@vercel/blob";
import { extractPcn } from "@/lib/ocr/extract";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "no file" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type || "image/jpeg";

  const blob = await put(`pcn/${crypto.randomUUID()}-${file.name}`, bytes, {
    access: "public",
    contentType: mediaType,
    addRandomSuffix: true,
  });

  let extracted;
  try {
    extracted = await extractPcn(bytes.toString("base64"), mediaType);
  } catch {
    extracted = {
      category: null, pcnNumber: null, authority: null, vehicleReg: null, dateOfPcn: null,
      discountPeriodDays: null, fullCost: null, discountedCost: null, cost: null,
    };
  }
  return Response.json({ imageUrl: blob.url, extracted });
}
