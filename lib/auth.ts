import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const COOKIE_NAME = "pcn_session";

export const ROLES = ["admin", "alan"] as const;
export type Role = (typeof ROLES)[number];

// v2 payloads carry the role; v1 ("authed:v1") sessions are no longer accepted,
// so everyone re-logs in once after this ships.
const payloadFor = (role: Role) => `authed:v2:${role}`;

function hmac(payload: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("hex");
}

export function signSession(role: Role): string {
  const payload = payloadFor(role);
  return `${payload}.${hmac(payload)}`;
}

export function verifySession(value: string | undefined): Role | null {
  if (!value) return null;
  for (const role of ROLES) {
    const expected = signSession(role);
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return role;
  }
  return null;
}

export async function getSessionRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE_NAME)?.value);
}
