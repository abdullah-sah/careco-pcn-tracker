import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/db";
import { pcn } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select({ url: pcn.imageUrl }).from(pcn).where(eq(pcn.id, id)).limit(1);
  if (!row?.url) return new Response("not found", { status: 404 });
  try {
    const res = await get(row.url, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!res || res.statusCode !== 200) return new Response("not found", { status: 404 });
    return new Response(res.stream, {
      headers: {
        "Content-Type": res.blob.contentType ?? res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
