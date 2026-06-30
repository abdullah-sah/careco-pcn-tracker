import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "pcn_session";
const PAYLOAD = "authed:v1";

async function valid(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  if (value.slice(0, i) !== PAYLOAD) return false;
  const sig = value.slice(i + 1);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(process.env.AUTH_SECRET!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(PAYLOAD));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(sig, expected);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (await valid(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
