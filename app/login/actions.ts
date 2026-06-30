"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, COOKIE_NAME } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password !== process.env.LOGIN_PASSWORD) redirect("/login?error=1");
  const jar = await cookies();
  jar.set(COOKIE_NAME, signSession(), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}
