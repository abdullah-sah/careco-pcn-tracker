import { createHmac } from "crypto";

export const COOKIE_NAME = "pcn_session";
const PAYLOAD = "authed:v1";

export function signSession(): string {
  const sig = createHmac("sha256", process.env.AUTH_SECRET!).update(PAYLOAD).digest("hex");
  return `${PAYLOAD}.${sig}`;
}
