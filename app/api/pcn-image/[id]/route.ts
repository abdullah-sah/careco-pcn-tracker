import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pcn } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select({ url: pcn.imageUrl }).from(pcn).where(eq(pcn.id, id)).limit(1);
  if (!row?.url) return new Response("not found", { status: 404 });
  const upstream = await fetch(row.url);
  if (!upstream.ok || !upstream.body) return new Response("not found", { status: 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
