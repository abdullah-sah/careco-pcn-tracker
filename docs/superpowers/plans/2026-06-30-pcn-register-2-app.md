# PCN Register — Plan 2: App (UI on DB · Auth · OCR · Export button)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing in-memory prototype into the working PCN Register: the register/detail/capture UI reads and writes the database, new PCNs are added by photo (Claude Haiku OCR auto-fills the form), the whole app sits behind a shared-password gate, and a button exports the identical-format workbook.

**Architecture:** A server component (`app/page.tsx`) loads PCNs from Postgres and hands them to the existing client component, which keeps a local optimistic copy. Mutations go through server actions (`app/actions.ts`); OCR + image upload go through a route handler (`app/api/ocr`). Middleware enforces a signed-cookie password gate. Letter images are stored in Vercel Blob and served only through an auth-gated proxy.

**Tech Stack:** Next.js 15 App Router · Drizzle/Neon (from Plan 1) · `@anthropic-ai/sdk` + `zod` (Haiku vision + structured outputs) · `@vercel/blob` · Web Crypto / `node:crypto` (auth).

## Prerequisites (from Plan 1, must already exist)

- `db/schema.ts` exporting `pcn`, `categoryEnum`, `PcnSelect`, `PcnInsert`.
- `db/index.ts` exporting `db`; `db/queries.ts` exporting `getRowsForExport()`.
- `lib/pcn/types.ts` (`Category`, `PcnRow`), `lib/convert.ts` (`poundsToPence`, `penceToPounds`).
- `lib/xlsx/export.ts` (`buildXlsx`), `lib/xlsx/template-data.ts` (`TEMPLATE_B64`).
- `app/api/export/route.ts` (GET → identical `.xlsx`).
- Existing client component at `components/pcn-portal.tsx` (the de-framed prototype, in-memory seed, "Recovery Desk"/"letter" copy) — **replaced wholesale in Task 5.**

## Global Constraints

- Product name **PCN Register**; user-facing noun is **"PCN"**, never "letter".
- App-bar title "Recovery Desk" → **PCN Register**; monogram "RD" → **PCN**; `<title>` → "PCN Register — Careco".
- OCR model is **`claude-haiku-4-5`**, vision + structured outputs, **no `effort`/`thinking` params** (Haiku 4.5 rejects/ignores them).
- **Driver name is never extracted from the image.**
- Costs handled as integer **pence** in the DB; the capture form takes pounds and converts.
- Council records use `fullCostPence` + `discountedCostPence` + the three "paid?" fields; private records use `costPence`. `category` = council/private.
- Every route except `/login` and Next internals is behind the auth gate.

## New env vars (`.env.local`, and Vercel project settings)

```
BLOB_READ_WRITE_TOKEN=...      # Vercel Blob
ANTHROPIC_API_KEY=...          # Claude Haiku OCR
LOGIN_PASSWORD=...             # the shared password
AUTH_SECRET=...                # 32+ random chars for cookie signing
```

---

## File Structure

- `lib/pcn/view.ts` — `PcnView`, `toView(PcnSelect)`.
- `db/queries.ts` — add `getAllPcns()`, `nextSortSeq()`.
- `app/actions.ts` — `createPcn`, `updatePcn` server actions.
- `lib/ocr/extract.ts` — `extractPcn(base64, mediaType) → Extracted` (Haiku).
- `app/api/ocr/route.ts` — POST file → Blob + extract.
- `app/api/pcn-image/[id]/route.ts` — auth-gated image proxy.
- `lib/auth.ts` — `signSession`, `COOKIE_NAME`.
- `middleware.ts` — password gate (Edge, Web Crypto verify).
- `app/login/page.tsx`, `app/login/actions.ts` — login.
- `app/page.tsx` — server component: load PCNs → render `<PcnPortal>`.
- `components/pcn-portal.tsx` — replaced: DB-wired, rebranded, edit + OCR + export.

---

### Task 1: View type, queries, server actions

**Files:**
- Create: `lib/pcn/view.ts`, `app/actions.ts`
- Modify: `db/queries.ts`
- Test: `lib/pcn/view.test.ts`

**Interfaces:**
- Consumes: `pcn`, `PcnSelect`, `PcnInsert` (`db/schema`), `db` (`db/index`), `Category` (`lib/pcn/types`), `poundsToPence` (`lib/convert`).
- Produces:
  - `type PcnView = Omit<PcnSelect, "createdAt" | "updatedAt">`; `toView(r: PcnSelect): PcnView`.
  - `getAllPcns(): Promise<PcnView[]>` (newest first), `nextSortSeq(): Promise<number>`.
  - `createPcn(input: CreatePcnInput): Promise<PcnView>`, `updatePcn(id: string, patch: UpdatePcnInput): Promise<PcnView>`.
  - `CreatePcnInput = { category: Category; pcnNumber: string; authority: string; vehicleReg: string; costPence: number | null; fullCostPence: number | null; discountedCostPence: number | null; dateOfPcn: string | null; discountPeriodDays: number | null; driverName: string | null; status: string | null; notes: string | null; imageUrl: string | null }`.
  - `UpdatePcnInput = Partial<Pick<PcnView, "status" | "driverName" | "notes" | "aliPaid" | "moneyRequested" | "driverPaid">>`.

- [ ] **Step 1: Write the failing test**

`lib/pcn/view.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toView } from "./view";

describe("toView", () => {
  it("drops timestamps and keeps domain fields", () => {
    const row: any = {
      id: "x", sortSeq: 1, category: "council", pcnNumber: "P1", authority: "Brent",
      vehicleReg: "AB12CDE", costPence: null, fullCostPence: 16000, discountedCostPence: 8000,
      dateOfPcn: "2026-06-19", discountPeriodDays: 14, driverName: null, aliPaid: null,
      moneyRequested: null, driverPaid: null, status: "Paid", notes: null, imageUrl: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const v = toView(row);
    expect(v).not.toHaveProperty("createdAt");
    expect(v.fullCostPence).toBe(16000);
    expect(v.pcnNumber).toBe("P1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/pcn/view.test.ts`
Expected: FAIL — cannot find module `./view`.

- [ ] **Step 3: Implement `lib/pcn/view.ts`**

```ts
import type { PcnSelect } from "@/db/schema";

export type PcnView = Omit<PcnSelect, "createdAt" | "updatedAt">;

export function toView(r: PcnSelect): PcnView {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return rest;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/pcn/view.test.ts`
Expected: PASS.

- [ ] **Step 5: Add queries to `db/queries.ts`** (append; keep existing `getRowsForExport`)

```ts
import { asc, desc, sql } from "drizzle-orm";
import { db } from "./index";
import { pcn } from "./schema";
import { toView, type PcnView } from "@/lib/pcn/view";

export async function getAllPcns(): Promise<PcnView[]> {
  const rows = await db.select().from(pcn).orderBy(desc(pcn.sortSeq));
  return rows.map(toView);
}

export async function nextSortSeq(): Promise<number> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${pcn.sortSeq}), 0)` })
    .from(pcn);
  return Number(max) + 1;
}
```
> If the file already imports `asc`/`sql`, do not duplicate the import line — merge the named imports.

- [ ] **Step 6: Implement `app/actions.ts`**

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pcn } from "@/db/schema";
import { toView, type PcnView } from "@/lib/pcn/view";
import { nextSortSeq } from "@/db/queries";
import type { Category } from "@/lib/pcn/types";

export interface CreatePcnInput {
  category: Category;
  pcnNumber: string;
  authority: string;
  vehicleReg: string;
  costPence: number | null;
  fullCostPence: number | null;
  discountedCostPence: number | null;
  dateOfPcn: string | null;
  discountPeriodDays: number | null;
  driverName: string | null;
  status: string | null;
  notes: string | null;
  imageUrl: string | null;
}

export type UpdatePcnInput = Partial<
  Pick<PcnView, "status" | "driverName" | "notes" | "aliPaid" | "moneyRequested" | "driverPaid">
>;

export async function createPcn(input: CreatePcnInput): Promise<PcnView> {
  const sortSeq = await nextSortSeq();
  const [row] = await db.insert(pcn).values({ ...input, sortSeq }).returning();
  revalidatePath("/");
  return toView(row);
}

export async function updatePcn(id: string, patch: UpdatePcnInput): Promise<PcnView> {
  const [row] = await db
    .update(pcn)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pcn.id, id))
    .returning();
  revalidatePath("/");
  return toView(row);
}
```

- [ ] **Step 7: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add lib/pcn/view.ts lib/pcn/view.test.ts db/queries.ts app/actions.ts
git commit -m "feat: PcnView, list/max-seq queries, create/update server actions"
```

---

### Task 2: OCR extraction (Claude Haiku) + Blob upload + image proxy

**Files:**
- Create: `lib/ocr/extract.ts`, `app/api/ocr/route.ts`, `app/api/pcn-image/[id]/route.ts`
- Test: `lib/ocr/extract.test.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`, `zod`, `@vercel/blob`)

**Interfaces:**
- Produces:
  - `interface Extracted { category: "council" | "private" | null; pcnNumber: string | null; authority: string | null; vehicleReg: string | null; dateOfPcn: string | null; discountPeriodDays: number | null; fullCost: number | null; discountedCost: number | null; cost: number | null }` (costs in **pounds**).
  - `extractPcn(base64: string, mediaType: string): Promise<Extracted>`.
  - `POST /api/ocr` (multipart `file`) → `{ imageUrl: string; extracted: Extracted }`.
  - `GET /api/pcn-image/[id]` → streams the stored image.

- [ ] **Step 1: Install deps**

Run: `npm install @anthropic-ai/sdk zod @vercel/blob`
Expected: success.

- [ ] **Step 2: Write the failing test (mock the SDK)**

`lib/ocr/extract.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        parse: async () => ({
          parsed_output: {
            category: "council", pcnNumber: "AB12", authority: "Brent", vehicleReg: "AB12CDE",
            dateOfPcn: "2026-06-19", discountPeriodDays: 14, fullCost: 130, discountedCost: 65, cost: null,
          },
        }),
      };
    },
  };
});

import { extractPcn } from "./extract";

describe("extractPcn", () => {
  it("returns the parsed structured fields", async () => {
    const r = await extractPcn("ZmFrZQ==", "image/jpeg");
    expect(r.pcnNumber).toBe("AB12");
    expect(r.fullCost).toBe(130);
    expect(r.category).toBe("council");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/ocr/extract.test.ts`
Expected: FAIL — cannot find module `./extract`.

- [ ] **Step 4: Implement `lib/ocr/extract.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const ExtractedSchema = z.object({
  category: z.enum(["council", "private"]).nullable(),
  pcnNumber: z.string().nullable(),
  authority: z.string().nullable(),
  vehicleReg: z.string().nullable(),
  dateOfPcn: z.string().nullable(), // YYYY-MM-DD
  discountPeriodDays: z.number().int().nullable(),
  fullCost: z.number().nullable(),
  discountedCost: z.number().nullable(),
  cost: z.number().nullable(),
});

export type Extracted = z.infer<typeof ExtractedSchema>;

const PROMPT = `You are reading a UK Parking Charge Notice (PCN) letter image.
Extract these fields. Use null when a field is not present. DO NOT extract the driver's name.
- category: "council" if issued by a local authority/council/TfL, "private" if a private operator (ParkingEye, UKPC, Euro Car Parks, APCOA, etc.)
- pcnNumber, authority (issuing council or company), vehicleReg (uppercase, no spaces if shown that way)
- dateOfPcn as YYYY-MM-DD; discountPeriodDays as an integer number of days
- fullCost and discountedCost in pounds (numbers, no currency symbol). For private notices with a single amount, set "cost" and leave full/discounted null.`;

export async function extractPcn(base64: string, mediaType: string): Promise<Extracted> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedSchema) },
  });
  return res.parsed_output ?? {
    category: null, pcnNumber: null, authority: null, vehicleReg: null, dateOfPcn: null,
    discountPeriodDays: null, fullCost: null, discountedCost: null, cost: null,
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/ocr/extract.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `app/api/ocr/route.ts`**

```ts
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
```
> Blob URLs are public but unguessable, and are never rendered to the client (images load via the auth-gated proxy below). Hardening note: switch to a private Blob store + signed URLs if public-CDN exposure is unacceptable.

- [ ] **Step 7: Implement `app/api/pcn-image/[id]/route.ts`** (auth-gated by middleware)

```ts
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
```

- [ ] **Step 8: Commit**

```bash
git add lib/ocr/ app/api/ocr/ app/api/pcn-image/ package.json package-lock.json
git commit -m "feat: Haiku OCR extraction, Blob upload, auth-gated image proxy"
```

---

### Task 3: Shared-password auth (cookie + middleware + login)

**Files:**
- Create: `lib/auth.ts`, `middleware.ts`, `app/login/page.tsx`, `app/login/actions.ts`

**Interfaces:**
- Produces: `signSession(): string`, `COOKIE_NAME` (`lib/auth.ts`); `middleware` gate; `login(formData)` action.

- [ ] **Step 1: Implement `lib/auth.ts`** (server/node — used by the login action)

```ts
import { createHmac } from "crypto";

export const COOKIE_NAME = "pcn_session";
const PAYLOAD = "authed:v1";

export function signSession(): string {
  const sig = createHmac("sha256", process.env.AUTH_SECRET!).update(PAYLOAD).digest("hex");
  return `${PAYLOAD}.${sig}`;
}
```

- [ ] **Step 2: Implement `middleware.ts`** (Edge — verifies via Web Crypto)

```ts
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
  return sig === expected;
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
```

- [ ] **Step 3: Implement `app/login/actions.ts`**

```ts
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
```

- [ ] **Step 4: Implement `app/login/page.tsx`**

```tsx
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f0e6", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
      <form action={login} style={{ background: "#fffdf8", border: "1px solid #e2dbcd", borderRadius: 12, padding: "28px 26px", width: 320, boxShadow: "0 18px 50px -18px rgba(40,32,20,.45)" }}>
        <div style={{ font: "600 18px 'Spectral',serif", marginBottom: 4 }}>PCN Register</div>
        <div style={{ font: "500 9px 'Spline Sans Mono'", letterSpacing: "1.6px", color: "#9a9081", marginBottom: 18 }}>CARECO · PCN REGISTER</div>
        <input name="password" type="password" placeholder="Shared password" autoFocus
          style={{ width: "100%", boxSizing: "border-box", background: "#faf6ec", border: "1px solid #e2dbcd", borderRadius: 8, padding: "11px 12px", font: "500 13px 'Hanken Grotesk'", outline: "none" }} />
        {error ? <div style={{ color: "#9c3327", font: "500 11px 'Hanken Grotesk'", marginTop: 8 }}>Incorrect password.</div> : null}
        <button type="submit" style={{ width: "100%", marginTop: 16, background: "#9c3327", color: "#fffdf8", border: "none", borderRadius: 8, padding: "12px", font: "700 12px 'Spline Sans Mono'", letterSpacing: ".5px", cursor: "pointer" }}>SIGN IN</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Verify the gate**

Run:
```bash
PORT=3217 npm run dev &
sleep 4
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3217/"
kill %1
```
Expected: `307 .../login?next=%2F` (unauthenticated root redirects to login).

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts middleware.ts app/login/
git commit -m "feat: shared-password auth gate (signed cookie + middleware + login)"
```

---

### Task 4: Server page that loads PCNs

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getAllPcns()` (Task 1).
- Produces: renders `<PcnPortal initialPcns={...} />` (component finalized in Task 5).

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import PcnPortal from "@/components/pcn-portal";
import { getAllPcns } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pcns = await getAllPcns();
  return <PcnPortal initialPcns={pcns} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: load PCNs from the database into the register page"
```

---

### Task 5: Replace the client component — DB-wired, rebranded, edit + OCR + export

**Files:**
- Replace: `components/pcn-portal.tsx`
- Modify: `app/layout.tsx` (title)

**Interfaces:**
- Consumes: `PcnView` (`lib/pcn/view`), `createPcn`/`updatePcn`/`CreatePcnInput`/`UpdatePcnInput` (`app/actions`), `penceToPounds`/`poundsToPence` (`lib/convert`).
- Produces: `export default function PcnPortal({ initialPcns }: { initialPcns: PcnView[] })`.

- [ ] **Step 1: Replace `components/pcn-portal.tsx` with the full file below**

```tsx
"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { PcnView } from "@/lib/pcn/view";
import { createPcn, updatePcn } from "@/app/actions";
import { penceToPounds, poundsToPence } from "@/lib/convert";

/* ---------- helpers ---------- */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function gbp(p: number | null | undefined): string {
  if (p == null) return "—";
  const n = p / 100;
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = String(iso).split("-");
  if (p.length < 3) return String(iso);
  return parseInt(p[2], 10) + " " + (MONTHS[parseInt(p[1], 10) - 1] || "") + " " + p[0];
}

const cssCache = new Map<string, React.CSSProperties>();
function css(str: string): React.CSSProperties {
  const hit = cssCache.get(str);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const decl of str.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const rawKey = decl.slice(0, i).trim();
    if (!rawKey) continue;
    let val = decl.slice(i + 1).trim();
    const key = rawKey.startsWith("--") ? rawKey : rawKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    if (key === "font" && !/['"]/.test(val) && !/(serif|sans-serif|monospace|system-ui)/.test(val)) {
      val += " 'Hanken Grotesk',sans-serif";
    }
    out[key] = val;
  }
  const res = out as React.CSSProperties;
  cssCache.set(str, res);
  return res;
}
function merge(base: string, extra: React.CSSProperties): React.CSSProperties {
  return { ...css(base), ...extra };
}
function Hover({ tag = "div", base, hover, children, ...rest }: { tag?: React.ElementType; base: React.CSSProperties; hover: React.CSSProperties; children?: React.ReactNode } & Record<string, unknown>) {
  const [on, setOn] = useState(false);
  return React.createElement(tag, { style: on ? { ...base, ...hover } : base, onMouseEnter: () => setOn(true), onMouseLeave: () => setOn(false), ...rest }, children);
}
const LABEL = "font:500 9px 'Spline Sans Mono';letter-spacing:.8px;color:#a89e8c;margin-bottom:5px";
const INPUT_MONO = "width:100%;box-sizing:border-box;background:#faf6ec;border:1px solid #e2dbcd;border-radius:7px;padding:9px 11px;font:600 12px 'Spline Sans Mono';color:#211d18;outline:none";
const INPUT_HANKEN = "width:100%;box-sizing:border-box;background:#faf6ec;border:1px solid #e2dbcd;border-radius:7px;padding:9px 11px;font:600 12px 'Hanken Grotesk';color:#211d18;outline:none";
function Field({ label, value, vstyle }: { label: string; value: React.ReactNode; vstyle: string }) {
  return <div><div style={css(LABEL)}>{label}</div><div style={css(vstyle)}>{value}</div></div>;
}

const ACCENT = "#9c3327";
type Category = "council" | "private";
interface Draft { pcnNumber: string; authority: string; vehicleReg: string; dateOfPcn: string; discountPeriodDays: string; full: string; disc: string; cost: string; driverName: string }
function emptyDraft(): Draft { return { pcnNumber: "", authority: "", vehicleReg: "", dateOfPcn: "", discountPeriodDays: "", full: "", disc: "", cost: "", driverName: "" }; }
function penceStr(p: number | null): string { return p == null ? "" : String(penceToPounds(p)); }

interface State {
  view: "register" | "detail" | "capture";
  q: string; cat: "all" | Category; sort: "logged" | "reg" | "authority" | "date"; sortDir: number;
  showDiscounted: boolean; selectedId: string | null; newId: string | null; pcns: PcnView[];
  capStage: "idle" | "extracting" | "draft"; capFileName: string | null; capPreview: string | null; capImageUrl: string | null;
  capCat: Category; draft: Draft | null; edit: Record<string, string>; saving: boolean;
}

export default function PcnPortal({ initialPcns }: { initialPcns: PcnView[] }) {
  const router = useRouter();
  const [state, setState] = useState<State>(() => ({
    view: "register", q: "", cat: "all", sort: "logged", sortDir: -1, showDiscounted: false,
    selectedId: null, newId: null, pcns: initialPcns,
    capStage: "idle", capFileName: null, capPreview: null, capImageUrl: null, capCat: "council",
    draft: null, edit: {}, saving: false,
  }));
  const update = useCallback((patch: Partial<State> | ((s: State) => Partial<State>)) =>
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), []);

  const byId = (id: string | null) => state.pcns.find((p) => p.id === id) || null;

  /* nav */
  const goRegister = () => update({ view: "register" });
  const openDetail = (id: string) => {
    const p = state.pcns.find((x) => x.id === id)!;
    update({ view: "detail", selectedId: id, edit: {
      status: p.status ?? "", driverName: p.driverName ?? "", notes: p.notes ?? "",
      aliPaid: p.aliPaid ?? "", moneyRequested: p.moneyRequested ?? "", driverPaid: p.driverPaid ?? "",
    } });
  };

  /* search / filter / sort */
  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => update({ q: e.target.value });
  const setCat = (c: State["cat"]) => update({ cat: c });
  const toggleSort = (k: State["sort"]) => update((s) => ({ sort: k, sortDir: s.sort === k ? -s.sortDir : 1 }));
  const toggleDiscounted = () => update((s) => ({ showDiscounted: !s.showDiscounted }));

  /* capture */
  const openCapture = () => update({ view: "capture", capStage: "idle", draft: null, capFileName: null, capPreview: null, capImageUrl: null });
  const capManual = () => update({ view: "capture", capStage: "draft", capCat: "council", capFileName: "manual entry", capPreview: null, capImageUrl: null, draft: emptyDraft() });
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => update({ capPreview: rd.result as string });
    rd.readAsDataURL(f);
    update({ capStage: "extracting", capFileName: f.name });
    const fd = new FormData();
    fd.append("file", f);
    fetch("/api/ocr", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((data: { imageUrl: string; extracted: any }) => {
        const ex = data.extracted || {};
        update({
          capStage: "draft", capImageUrl: data.imageUrl,
          capCat: ex.category === "private" ? "private" : "council",
          draft: {
            pcnNumber: ex.pcnNumber ?? "", authority: ex.authority ?? "", vehicleReg: ex.vehicleReg ?? "",
            dateOfPcn: ex.dateOfPcn ?? "", discountPeriodDays: ex.discountPeriodDays != null ? String(ex.discountPeriodDays) : "",
            full: ex.fullCost != null ? String(ex.fullCost) : "", disc: ex.discountedCost != null ? String(ex.discountedCost) : "",
            cost: ex.cost != null ? String(ex.cost) : "", driverName: "",
          },
        });
      })
      .catch(() => update({ capStage: "draft", draft: emptyDraft() }));
  };
  const capField = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update((s) => ({ draft: { ...(s.draft ?? emptyDraft()), [k]: e.target.value } }));
  const setCapCat = (c: Category) => update({ capCat: c });
  const capReset = () => update({ capStage: "idle", draft: null, capFileName: null, capPreview: null, capImageUrl: null });
  const capSave = async () => {
    const d = state.draft; if (!d || state.saving) return;
    update({ saving: true });
    const council = state.capCat === "council";
    const pence = (s: string) => { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(n) ? null : poundsToPence(n); };
    try {
      const view = await createPcn({
        category: state.capCat, pcnNumber: d.pcnNumber || "(unnumbered)", authority: d.authority || "—",
        vehicleReg: (d.vehicleReg || "").toUpperCase() || "—",
        costPence: council ? null : pence(d.cost), fullCostPence: council ? pence(d.full) : null,
        discountedCostPence: council ? pence(d.disc) : null,
        dateOfPcn: d.dateOfPcn || null, discountPeriodDays: d.discountPeriodDays ? parseInt(d.discountPeriodDays, 10) : null,
        driverName: (d.driverName || "").trim() || null, status: null, notes: null, imageUrl: state.capImageUrl,
      });
      update((s) => ({ pcns: [view, ...s.pcns], view: "register", newId: view.id, saving: false, capStage: "idle", draft: null, capPreview: null, capImageUrl: null }));
      router.refresh();
    } catch { update({ saving: false }); }
  };

  /* detail edit */
  const editField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update((s) => ({ edit: { ...s.edit, [k]: e.target.value } }));
  const saveEdit = async () => {
    const id = state.selectedId; if (!id || state.saving) return;
    update({ saving: true });
    const e = state.edit;
    const patch: any = { status: e.status || null, driverName: e.driverName || null, notes: e.notes || null };
    const p = byId(id);
    if (p?.category === "council") { patch.aliPaid = e.aliPaid || null; patch.moneyRequested = e.moneyRequested || null; patch.driverPaid = e.driverPaid || null; }
    try {
      const view = await updatePcn(id, patch);
      update((s) => ({ pcns: s.pcns.map((x) => (x.id === id ? view : x)), saving: false }));
      router.refresh();
    } catch { update({ saving: false }); }
  };

  /* view-models */
  const catBg = (c: string) => (c === "council" ? "#e7eef0" : "#f3e3df");
  const catFg = (c: string) => (c === "council" ? "#3a5a66" : "#9c3327");
  const rowCost = (p: PcnView) => p.category === "private" ? gbp(p.costPence) : gbp(state.showDiscounted ? p.discountedCostPence : p.fullCostPence);

  const registerRows = () => {
    const { q, cat, sort, sortDir } = state;
    const ql = q.trim().toLowerCase();
    const filtered = state.pcns.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!ql) return true;
      return (p.vehicleReg + " " + p.pcnNumber + " " + p.authority + " " + (p.driverName || "")).toLowerCase().includes(ql);
    });
    const keyOf = (p: PcnView) => sort === "reg" ? p.vehicleReg : sort === "authority" ? p.authority : sort === "date" ? (p.dateOfPcn || "") : String(p.sortSeq).padStart(12, "0");
    return [...filtered].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 * sortDir : keyOf(a) > keyOf(b) ? 1 * sortDir : 0));
  };

  const mark = (k: State["sort"]) => (state.sort === k ? (state.sortDir < 0 ? "↓" : "↑") : "");
  const chip = (key: State["cat"], label: string) => ({ key, label, bg: state.cat === key ? "#211d18" : "#fffdf8", fg: state.cat === key ? "#fffdf8" : "#6a6155", bd: state.cat === key ? "#211d18" : "#e2dbcd" });

  const total = state.pcns.length;
  const rows = registerRows();
  const d = byId(state.selectedId);
  const dupe = !!state.draft && state.pcns.some((p) => p.pcnNumber.toLowerCase() === state.draft!.pcnNumber.trim().toLowerCase());
  const GRID = "grid-template-columns:96px 138px 1fr 78px 116px 70px";

  return (
    <div style={{ ...css("min-height:100vh;background:#f4f0e6;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#211d18"), "--accent": ACCENT } as React.CSSProperties}>
      {/* APP BAR */}
      <header style={css("position:sticky;top:0;z-index:10;background:#fffdf8;border-bottom:1px solid #e2dbcd")}>
        <div style={css("max-width:1020px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:15px 24px")}>
          <div style={css("display:flex;align-items:center;gap:12px;cursor:pointer")} onClick={goRegister}>
            <div style={css("width:34px;height:34px;border:1.5px solid var(--accent,#9c3327);border-radius:6px;display:flex;align-items:center;justify-content:center;transform:rotate(-4deg);font:700 10px 'Spline Sans Mono';color:var(--accent,#9c3327)")}>PCN</div>
            <div>
              <div style={css("font:600 15px 'Spectral',serif;letter-spacing:.2px")}>PCN Register</div>
              <div style={css("font:500 9px 'Spline Sans Mono';color:#9a9081;letter-spacing:1.6px")}>CARECO · PCN REGISTER</div>
            </div>
          </div>
          <div style={css("display:flex;align-items:center;gap:14px")}>
            <a href="/api/export" style={css("text-decoration:none;font:700 11px 'Spline Sans Mono';letter-spacing:.5px;color:#6a6155;background:#fffdf8;border:1.5px solid #e2dbcd;padding:8px 13px;border-radius:9px;cursor:pointer")}>↧ EXPORT XLSX</a>
            <div style={css("text-align:right;font:500 10px 'Spline Sans Mono';color:#8a8175;line-height:1.5")}>
              <div>UK GDPR · name-only</div>
            </div>
          </div>
        </div>
      </header>

      <main style={css("max-width:1020px;margin:0 auto")}>
        {/* REGISTER */}
        {state.view === "register" && (
          <div>
            <div style={css("display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px 14px")}>
              <div>
                <div style={css("font:600 20px 'Spectral',serif")}>PCN register</div>
                <div style={css("font:400 11.5px;color:#8a8175;margin-top:2px")}>{total}{total === 1 ? " PCN logged" : " PCNs logged"} · stored PCNs, replacing the spreadsheet</div>
              </div>
              <div style={css("display:flex;align-items:center;gap:10px")}>
                <div style={css("display:flex;align-items:center;gap:8px;background:#fffdf8;border:1.5px solid #e2dbcd;border-radius:9px;padding:0 12px")}>
                  <span style={css("font:600 12px 'Spline Sans Mono';color:#a89e8c")}>⌕</span>
                  <input value={state.q} onChange={onSearch} placeholder="Search reg, PCN, authority, driver" style={css("border:none;outline:none;background:transparent;font:500 12px 'Hanken Grotesk';color:#211d18;width:220px;padding:9px 2px")} />
                </div>
                <div style={css("display:flex;align-items:center;gap:8px;font:700 11px 'Spline Sans Mono';letter-spacing:.5px;color:#fffdf8;background:var(--accent,#9c3327);padding:9px 15px;border-radius:9px;cursor:pointer;transform:rotate(-1deg);box-shadow:0 2px 0 rgba(120,40,30,.35)")} onClick={openCapture}>＋ ADD PCN</div>
              </div>
            </div>

            <div style={css("display:flex;align-items:center;gap:8px;padding:0 24px 14px")}>
              {[chip("all", "All"), chip("council", "Council"), chip("private", "Private")].map((c) => (
                <div key={c.key} style={merge("font:600 11px 'Hanken Grotesk';padding:7px 13px;border-radius:7px;cursor:pointer", { background: c.bg, color: c.fg, border: `1px solid ${c.bd}` })} onClick={() => setCat(c.key)}>{c.label}</div>
              ))}
            </div>

            <div style={css("padding:0 24px 24px")}>
              <div style={css(`font:500 9px 'Spline Sans Mono';letter-spacing:1px;color:#a89e8c;display:grid;${GRID};gap:12px;padding:0 12px 9px;border-bottom:1.5px solid #211d18`)}>
                <span style={{ cursor: "pointer" }} onClick={() => toggleSort("reg")}>VEHICLE {mark("reg")}</span>
                <span>PCN NUMBER</span>
                <span style={{ cursor: "pointer" }} onClick={() => toggleSort("authority")}>AUTHORITY · DRIVER {mark("authority")}</span>
                <span>CATEGORY</span>
                <span style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>DATE OF PCN {mark("date")}</span>
                <span style={{ textAlign: "right", cursor: "pointer" }} onClick={toggleDiscounted} title="Toggle full / discounted cost (council)">{state.showDiscounted ? "DISCOUNTED" : "FULL COST"}</span>
              </div>

              {rows.map((p) => (
                <Hover key={p.id}
                  base={merge(`display:grid;${GRID};gap:12px;align-items:center;padding:12px;border-bottom:1px solid #ece4d4;cursor:pointer;border-radius:7px`, { background: p.id === state.newId ? "#fff6df" : "transparent" })}
                  hover={{ background: "#faf6ec" }} onClick={() => openDetail(p.id)}>
                  <span style={css("font:600 12.5px 'Spline Sans Mono'")}>{p.vehicleReg}</span>
                  <span style={css("font:500 11.5px 'Spline Sans Mono';color:#6a6155")}>{p.pcnNumber}</span>
                  <span style={css("overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 12.5px")}>{p.authority} <span style={{ color: "#bcb3a0" }}>·</span> <span style={css("color:#8a8175;font-weight:400")}>{p.driverName || "— unassigned"}</span></span>
                  <span><span style={merge("font:600 9px 'Spline Sans Mono';letter-spacing:.5px;padding:3px 8px;border-radius:4px", { background: catBg(p.category), color: catFg(p.category) })}>{p.category}</span></span>
                  <span style={css("font:500 11.5px 'Spline Sans Mono';color:#6a6155")}>{fmtDate(p.dateOfPcn)}</span>
                  <span style={css("text-align:right;font:600 12.5px 'Spline Sans Mono'")}>{rowCost(p)}</span>
                </Hover>
              ))}
              {rows.length === 0 && <div style={css("text-align:center;padding:40px 0;color:#a89e8c;font:400 13px")}>No PCNs match — clear the search or add a PCN.</div>}
            </div>
          </div>
        )}

        {/* DETAIL + EDIT */}
        {state.view === "detail" && d && (
          <div style={css("padding:18px 24px 26px")}>
            <div style={css("display:flex;align-items:center;gap:14px;margin-bottom:18px")}>
              <div style={css("font:600 12px 'Spline Sans Mono';color:#8a8175;cursor:pointer")} onClick={goRegister}>← register</div>
              <div style={css("height:24px;width:1px;background:#e2dbcd")} />
              <div style={css("font:700 19px 'Spline Sans Mono';letter-spacing:.5px")}>{d.vehicleReg}</div>
              <span style={merge("font:600 9px 'Spline Sans Mono';letter-spacing:.6px;padding:3px 8px;border-radius:4px", { background: catBg(d.category), color: catFg(d.category) })}>{d.category}</span>
            </div>
            <div style={css("display:grid;grid-template-columns:1.25fr 1fr;gap:24px;align-items:start")}>
              <div style={css("background:#fffdf8;border:1px solid #e2dbcd;border-radius:11px;padding:20px 22px")}>
                <div style={css("font:600 14px 'Spectral',serif;margin-bottom:16px")}>Stored record</div>
                <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:16px 22px")}>
                  <Field label="PCN NUMBER" value={d.pcnNumber} vstyle="font:600 14px 'Spline Sans Mono'" />
                  <Field label="ISSUING AUTHORITY" value={d.authority} vstyle="font:500 14px" />
                  <Field label="VEHICLE REG" value={d.vehicleReg} vstyle="font:600 14px 'Spline Sans Mono'" />
                  <Field label="DATE OF PCN" value={fmtDate(d.dateOfPcn)} vstyle="font:500 14px 'Spline Sans Mono'" />
                  <Field label="DISCOUNT PERIOD" value={d.discountPeriodDays != null ? `${d.discountPeriodDays} days` : "—"} vstyle="font:500 14px 'Spline Sans Mono'" />
                  {d.category === "council" ? (
                    <>
                      <Field label="FULL COST" value={gbp(d.fullCostPence)} vstyle="font:600 14px 'Spline Sans Mono'" />
                      <Field label="DISCOUNTED COST" value={gbp(d.discountedCostPence)} vstyle="font:600 14px 'Spline Sans Mono'" />
                    </>
                  ) : (
                    <Field label="COST OF PCN" value={gbp(d.costPence)} vstyle="font:600 14px 'Spline Sans Mono'" />
                  )}
                </div>

                <div style={css("margin-top:18px;padding-top:16px;border-top:1px solid #ece4d4;display:grid;grid-template-columns:1fr 1fr;gap:13px 16px")}>
                  <div><div style={css(LABEL)}>DRIVER (name only)</div><input value={state.edit.driverName} onChange={editField("driverName")} placeholder="—" style={css(INPUT_HANKEN)} /></div>
                  <div><div style={css(LABEL)}>STATUS</div><input value={state.edit.status} onChange={editField("status")} placeholder="e.g. Paid, Appeal submitted" style={css(INPUT_HANKEN)} /></div>
                  {d.category === "council" && (
                    <>
                      <div><div style={css(LABEL)}>ALI PAID?</div><input value={state.edit.aliPaid} onChange={editField("aliPaid")} style={css(INPUT_MONO)} /></div>
                      <div><div style={css(LABEL)}>MONEY REQUESTED?</div><input value={state.edit.moneyRequested} onChange={editField("moneyRequested")} style={css(INPUT_MONO)} /></div>
                      <div><div style={css(LABEL)}>DRIVER PAID?</div><input value={state.edit.driverPaid} onChange={editField("driverPaid")} style={css(INPUT_MONO)} /></div>
                    </>
                  )}
                  <div style={{ gridColumn: "span 2" }}><div style={css(LABEL)}>NOTES</div><textarea value={state.edit.notes} onChange={editField("notes")} rows={2} style={css(INPUT_HANKEN)} /></div>
                </div>

                <div style={css("display:flex;align-items:center;gap:12px;margin-top:16px")}>
                  <div style={css(`font:700 12px 'Spline Sans Mono';letter-spacing:.6px;padding:11px 16px;border-radius:8px;cursor:pointer;background:var(--accent,#9c3327);color:#fffdf8;box-shadow:0 3px 0 rgba(120,40,30,.35)${state.saving ? ";opacity:.6" : ""}`)} onClick={saveEdit}>{state.saving ? "SAVING…" : "SAVE CHANGES"}</div>
                </div>
              </div>

              <div>
                <div style={css("font:500 9px 'Spline Sans Mono';letter-spacing:.8px;color:#a89e8c;margin-bottom:9px")}>PCN ON FILE</div>
                {d.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/pcn-image/${d.id}`} alt="PCN on file" style={css("width:100%;border-radius:11px;border:1px solid #e2dbcd;display:block")} />
                ) : (
                  <div style={css("width:100%;height:280px;border-radius:11px;border:1px dashed #d8cfbd;background:repeating-linear-gradient(45deg,#f6f1e6,#f6f1e6 9px,#f1ebdd 9px,#f1ebdd 18px);display:flex;align-items:center;justify-content:center;font:500 10px 'Spline Sans Mono';color:#b3a892;letter-spacing:1px")}>no PCN image</div>
                )}
                <div style={css("font:400 10.5px;color:#a89e8c;margin-top:8px;line-height:1.5")}>Held in private storage for audit.</div>
              </div>
            </div>
          </div>
        )}

        {/* CAPTURE */}
        {state.view === "capture" && (
          <div style={css("padding:20px 24px 28px;min-height:460px")}>
            <div style={css("display:flex;align-items:center;gap:14px;margin-bottom:6px")}>
              <div style={css("font:600 12px 'Spline Sans Mono';color:#8a8175;cursor:pointer")} onClick={goRegister}>← register</div>
              <div style={css("height:22px;width:1px;background:#e2dbcd")} />
              <div style={css("font:600 19px 'Spectral',serif")}>Add a PCN</div>
            </div>
            <div style={css("font:400 12px;color:#8a8175;margin-bottom:20px;max-width:560px")}>Take a photo of the PCN or upload one — the details are read off automatically. <b>Nothing is saved until you check the fields and press Save.</b> No driver name is read from the image.</div>

            <div style={css("display:grid;grid-template-columns:340px 1fr;gap:24px;align-items:start")}>
              <div>
                {state.capStage === "idle" && (
                  <div style={css("display:flex;flex-direction:column;gap:12px")}>
                    <Hover tag="label" base={css("display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;height:188px;background:var(--accent,#9c3327);border-radius:13px;cursor:pointer;text-align:center;padding:18px;color:#fffdf8")} hover={{ filter: "brightness(1.06)" }}>
                      <div style={css("width:44px;height:44px;border:1.5px solid #f0d9cf;border-radius:9px;display:flex;align-items:center;justify-content:center;font:700 18px 'Spline Sans Mono';transform:rotate(-4deg)")}>▣</div>
                      <div style={css("font:700 14px 'Hanken Grotesk'")}>Take a photo</div>
                      <div style={css("font:400 10.5px;color:#f0d9cf")}>Use the camera to snap the PCN</div>
                      <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
                    </Hover>
                    <Hover tag="label" base={css("display:flex;align-items:center;justify-content:center;gap:10px;height:64px;background:#fffdf8;border:1.5px dashed #d8cfbd;border-radius:13px;cursor:pointer;text-align:center;font:600 13px 'Hanken Grotesk';color:#6a6155")} hover={{ borderColor: "var(--accent,#9c3327)" }}>
                      <span style={css("font:700 15px 'Spline Sans Mono';color:var(--accent,#9c3327)")}>↑</span> Upload an image
                      <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
                    </Hover>
                    <div style={css("text-align:center;font:500 11px 'Hanken Grotesk';color:#a89e8c;padding-top:4px;cursor:pointer")} onClick={capManual}>or enter the details manually</div>
                  </div>
                )}
                {state.capStage === "extracting" && (
                  <div style={css("display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;height:280px;background:#1b1714;border-radius:13px;color:#efe9dd")}>
                    <span style={css("width:30px;height:30px;border:3px solid #4a3f37;border-top-color:#c9a98a;border-radius:50%;animation:rdspin .8s linear infinite")} />
                    <div style={css("font:600 13px 'Hanken Grotesk'")}>Reading the PCN…</div>
                    <div style={css("font:500 10px 'Spline Sans Mono';color:#9a8d80")}>{state.capFileName}</div>
                  </div>
                )}
                {state.capStage === "draft" && (
                  <div>
                    {state.capPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={state.capPreview} alt="captured PCN" style={css("width:100%;border-radius:13px;border:1px solid #e2dbcd;display:block")} />
                    ) : (
                      <div style={css("height:220px;border-radius:13px;border:1px dashed #d8cfbd;background:repeating-linear-gradient(45deg,#f6f1e6,#f6f1e6 9px,#f1ebdd 9px,#f1ebdd 18px);display:flex;align-items:center;justify-content:center;font:500 10px 'Spline Sans Mono';color:#b3a892")}>manual entry — no image</div>
                    )}
                    <div style={css("font:400 10.5px;color:#a89e8c;margin-top:8px")}>{state.capFileName}</div>
                  </div>
                )}
              </div>

              {state.capStage === "draft" && state.draft ? (
                <div style={css("background:#fffdf8;border:1px solid #e2dbcd;border-radius:13px;padding:20px 22px")}>
                  <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:16px")}>
                    <div style={css("font:600 15px 'Spectral',serif")}>Check &amp; save</div>
                    <span style={merge("font:500 9px 'Spline Sans Mono';letter-spacing:.6px;padding:4px 9px;border-radius:5px", dupe ? { background: "#f3e3df", color: "#9c3327" } : { background: "#eaf2ea", color: "#3f7d4e" })}>{dupe ? "ALREADY LOGGED" : "NEW PCN"}</span>
                  </div>
                  <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:13px 16px")}>
                    <div><div style={css(LABEL)}>PCN NUMBER</div><input value={state.draft.pcnNumber} onChange={capField("pcnNumber")} style={css(INPUT_MONO)} /></div>
                    <div><div style={css(LABEL)}>VEHICLE REG</div><input value={state.draft.vehicleReg} onChange={capField("vehicleReg")} style={css(INPUT_MONO)} /></div>
                    <div><div style={css(LABEL)}>ISSUING AUTHORITY</div><input value={state.draft.authority} onChange={capField("authority")} style={css(INPUT_HANKEN)} /></div>
                    <div>
                      <div style={css(LABEL)}>CATEGORY</div>
                      <div style={css("display:flex;gap:6px")}>
                        <div style={merge("flex:1;text-align:center;font:600 11px 'Hanken Grotesk';padding:8px;border-radius:7px;cursor:pointer;border:1px solid #e2dbcd", state.capCat === "council" ? { background: "#211d18", color: "#fffdf8" } : { background: "#fffdf8", color: "#6a6155" })} onClick={() => setCapCat("council")}>council</div>
                        <div style={merge("flex:1;text-align:center;font:600 11px 'Hanken Grotesk';padding:8px;border-radius:7px;cursor:pointer;border:1px solid #e2dbcd", state.capCat === "private" ? { background: "#211d18", color: "#fffdf8" } : { background: "#fffdf8", color: "#6a6155" })} onClick={() => setCapCat("private")}>private</div>
                      </div>
                    </div>
                    <div><div style={css(LABEL)}>DATE OF PCN</div><input value={state.draft.dateOfPcn} onChange={capField("dateOfPcn")} placeholder="2026-06-19" style={css(INPUT_MONO)} /></div>
                    <div><div style={css(LABEL)}>DISCOUNT PERIOD (DAYS)</div><input value={state.draft.discountPeriodDays} onChange={capField("discountPeriodDays")} placeholder="14" style={css(INPUT_MONO)} /></div>
                    {state.capCat === "council" ? (
                      <>
                        <div><div style={css(LABEL)}>FULL COST (£)</div><input value={state.draft.full} onChange={capField("full")} placeholder="130" style={css(INPUT_MONO)} /></div>
                        <div><div style={css(LABEL)}>DISCOUNTED COST (£)</div><input value={state.draft.disc} onChange={capField("disc")} placeholder="65" style={css(INPUT_MONO)} /></div>
                      </>
                    ) : (
                      <div><div style={css(LABEL)}>COST OF PCN (£)</div><input value={state.draft.cost} onChange={capField("cost")} placeholder="100" style={css(INPUT_MONO)} /></div>
                    )}
                    <div style={{ gridColumn: "span 2" }}><div style={css(LABEL)}>DRIVER · NAME ONLY (optional)</div><input value={state.draft.driverName} onChange={capField("driverName")} placeholder="Add later from the register" style={css(INPUT_HANKEN)} /></div>
                  </div>
                  <div style={css("display:flex;align-items:center;gap:12px;margin-top:18px")}>
                    <div style={css(`font:700 12px 'Spline Sans Mono';letter-spacing:.6px;padding:12px 18px;border-radius:8px;cursor:pointer;background:var(--accent,#9c3327);color:#fffdf8;transform:rotate(-1deg);box-shadow:0 3px 0 rgba(120,40,30,.35)${state.saving ? ";opacity:.6" : ""}`)} onClick={capSave}>{state.saving ? "SAVING…" : "SAVE TO REGISTER"}</div>
                    <div style={css("font:600 12px 'Hanken Grotesk';color:#8a8175;cursor:pointer")} onClick={capReset}>Discard</div>
                  </div>
                </div>
              ) : (
                <div style={css("display:flex;flex-direction:column;justify-content:center;height:280px;color:#a89e8c;font:400 12.5px;line-height:1.6;max-width:340px")}>
                  <div style={css("font:600 13px 'Spectral',serif;color:#6a6155;margin-bottom:8px")}>How it works</div>
                  Snap or upload the PCN and the fields fill themselves in. You review and correct anything before saving — what you save is what gets stored. The register checks the PCN number so you don&apos;t log the same PCN twice.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/layout.tsx` title**

Change the `metadata.title` to `"PCN Register — Careco"` and `description` to `"PCN register for Careco — stored PCNs, replacing the spreadsheet."`.

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles. (Fix any import-path typos surfaced here.)

- [ ] **Step 4: Commit**

```bash
git add components/pcn-portal.tsx app/page.tsx app/layout.tsx
git commit -m "feat: DB-wired PCN Register UI — edit, OCR capture, export button, rebrand"
```

---

### Task 6: End-to-end verification + deploy

**Files:** none (verification + config).

- [ ] **Step 1: Set local env**

Ensure `.env.local` has `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `LOGIN_PASSWORD`, `AUTH_SECRET`. (DB already seeded in Plan 1 Task 7.)

- [ ] **Step 2: Manual smoke test**

Run: `PORT=3217 npm run dev` then in a browser at `http://localhost:3217`:
- redirected to `/login`; wrong password shows the error; correct password lands on the register with the imported PCNs.
- search / filter chips / column sort work; cost-header toggles full↔discounted for council rows.
- open a council PCN → edit STATUS + a paid? field + NOTES → SAVE CHANGES → value persists after refresh.
- ADD PCN → upload a sample PCN image → fields auto-fill → correct → SAVE TO REGISTER → new row appears (highlighted), with its image visible in detail.
- EXPORT XLSX → downloaded file opens identical to the original and includes the new PCN at the **bottom** of its sheet.

- [ ] **Step 3: Deploy to Vercel**

Run:
```bash
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel env add BLOB_READ_WRITE_TOKEN production
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add LOGIN_PASSWORD production
npx vercel env add AUTH_SECRET production
npx vercel --prod
```
Expected: a production URL gated by the login; the same flows work. (Neon + Blob can be provisioned via the Vercel Marketplace and will inject `DATABASE_URL`/`BLOB_READ_WRITE_TOKEN` automatically — in that case skip the matching `env add`.)

- [ ] **Step 4: Commit any config**

```bash
git add -A && git commit -m "chore: vercel deploy config" || echo "nothing to commit"
```

---

## Self-Review (against spec §4, §8, §9, §10, §11, §12)

- **§4 stack** → Drizzle/Neon (Plan 1), Vercel Blob (Task 2), official Anthropic SDK + `claude-haiku-4-5` + structured outputs, **no effort/thinking** (Task 2), shared-password middleware (Task 3). ✓
- **§8 flows** → register/detail/**edit** (Task 5 detail inputs + `updatePcn`); **Add a PCN** OCR (Task 2 + Task 5 capture → `/api/ocr` → prefill → `createPcn`); **export** button → `/api/export` (Task 5 header link). ✓
- **§8 dedupe** → `dupe` check on PCN number (Task 5). **Driver never extracted** → prompt excludes it (Task 2) and the form's driver field is manual (Task 5). ✓
- **§9 auth** → `LOGIN_PASSWORD`/`AUTH_SECRET`, signed cookie, middleware redirect, login page (Task 3). Export + image routes sit behind the same gate. ✓
- **§10 testing** → `toView` test (Task 1), `extractPcn` mocked test (Task 2), middleware redirect check (Task 3), manual e2e (Task 6). ✓
- **§11 env** → Blob, Anthropic, login secrets (this plan); `DATABASE_URL` (Plan 1). ✓
- **§12 rebrand / PCN copy** → "PCN Register"/"PCN" monogram (Task 5 header), `ADD PCN`, `… PCNs logged`, `No PCNs match…`, `PCN ON FILE`, `Reading the PCN…`, `Take a photo of the PCN`, `no PCN image`, layout title (Task 5 Steps 1–2). ✓
- **Type consistency:** `PcnView` fields used in the component match `lib/pcn/view` / `db/schema`; `createPcn`/`updatePcn` input shapes match their call sites; `Extracted` field names match the OCR prompt and the capture prefill. ✓
- **Known follow-ups (flagged, not gaps):** public-Blob exposure (mitigated by the auth-gated proxy; private Blob + signed URLs is the hardening step); detail edit limited to status/driver/notes/paid? in v1 (cost/date edits read-only) per spec §13 "full edit" can be widened later; constant-time cookie compare is a `===` in v1.
