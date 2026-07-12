"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, COOKIE_NAME, type Role } from "@/lib/auth";

function matches(password: string, expected: string | undefined): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(expected ?? "");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  let role: Role | null = null;
  if (matches(password, process.env.LOGIN_PASSWORD)) role = "admin";
  else if (matches(password, process.env.LOGIN_PASSWORD_ALAN)) role = "alan";
  if (!role) redirect("/login?error=1");
  const jar = await cookies();
  jar.set(COOKIE_NAME, signSession(role), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  redirect("/login");
}
