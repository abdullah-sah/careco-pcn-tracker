"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, COOKIE_NAME } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const a = Buffer.from(password);
  const b = Buffer.from(process.env.LOGIN_PASSWORD ?? "");
  const ok = a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  if (!ok) redirect("/login?error=1");
  const jar = await cookies();
  jar.set(COOKIE_NAME, signSession(), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}
