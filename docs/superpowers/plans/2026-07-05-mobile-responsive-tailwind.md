# Mobile Responsive + Tailwind v4 Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `components/pcn-portal.tsx` from inline `css()` styling to Tailwind v4 and make every screen (navbar, register, add-a-PCN incl. check & save, detail, reset dialog) work on phones.

**Architecture:** Tailwind v4 via `@tailwindcss/postcss`; theme tokens in `app/globals.css` `@theme`. Mobile-first classes; `md:` (768px) restores the current desktop layout, which must stay visually identical. Conversion proceeds view-by-view; the legacy `css()` helper coexists until the last view converts, then is deleted.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 (PostCSS plugin), no component library.

**Spec:** `docs/superpowers/specs/2026-07-05-mobile-responsive-design.md`

## Global Constraints

- Desktop (≥768px) must remain **visually identical** to current rendering; same px values via tokens/arbitrary classes.
- **No logic changes**: state shape, handlers, data flow, element semantics untouched. JSX changes = className rewrites + wrapping two xlsx button labels in spans + one new mobile-only toggle chip.
- Mobile-first: base classes = phone, `md:` = desktop. No other breakpoints.
- All text inputs/textareas ≥16px font below `md` (iOS focus-zoom prevention).
- Only new deps: `tailwindcss`, `@tailwindcss/postcss`, `postcss`.
- Weight mapping: 400→`font-normal`, 500→`font-medium`, 600→`font-semibold`, 700→`font-bold`.
- Non-Tailwind px sizes use arbitrary values (`text-[12.5px]`, `rounded-[13px]`, `border-[1.5px]`); rotations always arbitrary (`-rotate-[1deg]`, `-rotate-[4deg]`).
- Commits: extremely concise messages, no AI/Claude mentions.
- Tests: repo has vitest for `lib/` only — no component tests exist and none are added (zero logic changes). Per-task verification = `npm run build` + targeted grep; full suite + manual visual pass in final task.

---

### Task 1: Tailwind v4 setup

**Files:**
- Modify: `package.json` (via npm install)
- Create: `postcss.config.mjs`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: theme tokens used by every later task — colors `accent #9c3327`, `ink #211d18`, `paper #fffdf8`, `cream #f4f0e6`, `field #faf6ec`, `line #e2dbcd`, `line-soft #ece4d4`, `muted #6a6155`, `faint #8a8175`, `sand #a89e8c`; fonts `font-hanken`, `font-spline`, `font-spectral`. Class usage: `bg-paper`, `text-ink`, `border-line`, `font-spline`, etc.

- [ ] **Step 1: Install**

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 2: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

- [ ] **Step 3: Replace `app/globals.css` entirely with:**

```css
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Spline+Sans+Mono:wght@400;500;600;700&family=Spectral:ital,wght@0,500;0,600;1,500&display=swap');
@import "tailwindcss";

@theme {
  --font-hanken: "Hanken Grotesk", system-ui, sans-serif;
  --font-spline: "Spline Sans Mono", monospace;
  --font-spectral: "Spectral", serif;

  --color-accent: #9c3327;
  --color-ink: #211d18;
  --color-paper: #fffdf8;
  --color-cream: #f4f0e6;
  --color-field: #faf6ec;
  --color-line: #e2dbcd;
  --color-line-soft: #ece4d4;
  --color-muted: #6a6155;
  --color-faint: #8a8175;
  --color-sand: #a89e8c;
}

html,
body {
  margin: 0;
  background: #f4f0e6;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-thumb {
  background: #cfc6b3;
  border-radius: 6px;
  border: 2px solid #e6e0d3;
}

@keyframes rdspin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes rdnew {
  0% {
    background: #fff6df;
  }
  100% {
    background: transparent;
  }
}
```

Notes: `* { box-sizing: border-box }` dropped — preflight provides it. Preflight also normalises placeholder colour (may shift slightly — acceptable). `pcn-portal.tsx` still renders from inline styles at this point, so it is unaffected; `app/login/page.tsx` uses fully-explicit inline style objects, so preflight barely touches it (verified in Task 6).

- [ ] **Step 4: Verify build + tokens compiled**

```bash
npm run build
grep -rl -- "--color-accent" .next/static/css/ | head -1
```
Expected: build succeeds; grep prints one CSS file path.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json postcss.config.mjs app/globals.css
git commit -m "feat: add tailwind v4"
```

---

### Task 2: Shared class constants + shell/header (mobile navbar)

**Files:**
- Modify: `components/pcn-portal.tsx` (constants near top; root div / header / main wrapper JSX)

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces (used by Tasks 3–5, exact definitions):

```ts
const LABEL_CLS = "font-spline font-medium text-[9px] tracking-[0.8px] text-sand mb-[5px]";
const INPUT_BASE = "w-full bg-field border border-line rounded-[7px] px-[11px] py-[9px] font-semibold text-[16px] md:text-xs text-ink outline-none";
const INPUT_MONO_CLS = `${INPUT_BASE} font-spline`;
const INPUT_HANKEN_CLS = `${INPUT_BASE} font-hanken`;
const catCls = (c: string) => c === "council" ? "bg-[#e7eef0] text-[#3a5a66]" : "bg-[#f3e3df] text-accent";
```

- [ ] **Step 1: Add the constants above** directly after the existing `INPUT_HANKEN` const (old `LABEL`/`INPUT_MONO`/`INPUT_HANKEN` stay for now — unconverted views still use them; deleted in Task 5).

- [ ] **Step 2: Convert root div** (currently sets `--accent` var):

```tsx
return (
  <div className="min-h-screen bg-cream font-hanken text-ink">
```
(and matching close; the `as React.CSSProperties` cast and `"--accent"` var go away — `bg-accent`/`text-accent` token replaces every `var(--accent,#9c3327)` in later tasks.)

- [ ] **Step 3: Convert header block.** Replace the whole `<header>…</header>` with:

```tsx
{/* APP BAR */}
<header className="sticky top-0 z-10 bg-paper border-b border-line">
  <div className="max-w-[1020px] mx-auto flex items-center justify-between px-4 py-3 md:px-6 md:py-[15px]">
    <div className="flex items-center gap-3 cursor-pointer" onClick={goRegister}>
      <div className="w-[34px] h-[34px] border-[1.5px] border-accent rounded-md flex items-center justify-center -rotate-[4deg] font-spline font-bold text-[10px] text-accent">PCN</div>
      <div>
        <div className="font-spectral font-semibold text-[15px] tracking-[0.2px]">PCN Register</div>
        <div className="font-spline font-medium text-[9px] text-[#9a9081] tracking-[1.6px]">CARECO · PCN REGISTER</div>
      </div>
    </div>
    <div className="flex items-center gap-2 md:gap-3.5">
      <label className={`inline-flex items-center justify-center w-10 h-10 md:w-auto md:h-auto md:px-[13px] md:py-2 font-spline font-bold text-[11px] tracking-[0.5px] text-muted bg-paper border-[1.5px] border-line rounded-[9px] cursor-pointer${state.importStage === "parsing" ? " opacity-60" : ""}`}>
      ↥<span className="hidden md:inline">&nbsp;{state.importStage === "parsing" ? "READING…" : "IMPORT XLSX"}</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onImportFile} disabled={state.importStage !== "idle"} className="hidden" />
      </label>
      <a href="/api/export" className="inline-flex items-center justify-center w-10 h-10 md:w-auto md:h-auto md:px-[13px] md:py-2 no-underline font-spline font-bold text-[11px] tracking-[0.5px] text-muted bg-paper border-[1.5px] border-line rounded-[9px] cursor-pointer">↧<span className="hidden md:inline">&nbsp;EXPORT XLSX</span></a>
      <div className="hidden md:block text-right font-spline font-medium text-[10px] text-faint leading-normal">
        <div>UK GDPR · name-only</div>
      </div>
    </div>
  </div>
</header>
```

Behaviour notes: desktop shows `↥ IMPORT XLSX` / `↥ READING…` (glyph now constant — spec'd); mobile shows 40×40 icon-only buttons, GDPR text hidden.

- [ ] **Step 4: Convert main wrapper + import error banner:**

```tsx
<main className="max-w-[1020px] mx-auto">
  {state.importError && state.importStage === "idle" && (
    <div className="px-4 md:px-6 pt-3 text-accent font-hanken font-medium text-[11px]">{state.importError}</div>
  )}
```

- [ ] **Step 5: Verify**

```bash
npm run build
```
Expected: success. Dev-check (optional): header renders one row at 390px, identical at 1280px.

- [ ] **Step 6: Commit**

```bash
git add components/pcn-portal.tsx
git commit -m "refactor: tailwind shell + navbar, mobile icon buttons"
```

---

### Task 3: Register view (toolbar, chips, mobile cost toggle, rows → cards)

**Files:**
- Modify: `components/pcn-portal.tsx` (the `{state.view === "register" && …}` block; delete `chip()` helper and `GRID` const)

**Interfaces:**
- Consumes: tokens; `catCls` from Task 2.
- Produces: `const GRID_COLS = "md:grid-cols-[96px_138px_1fr_78px_116px_70px]";` (module-level, replaces `GRID`; not used elsewhere).

- [ ] **Step 1: Delete `chip()` helper and the `GRID` const; add `GRID_COLS`** (definition above) where `GRID` was.

- [ ] **Step 2: Replace the register block** with:

```tsx
{/* REGISTER */}
{state.view === "register" && (
  <div>
    <div className="flex flex-col gap-3 px-4 pt-4 pb-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:pt-[18px] md:pb-[14px]">
      <div>
        <div className="font-spectral font-semibold text-xl">PCN register</div>
        <div className="text-[11.5px] text-faint mt-[2px]">{total}{total === 1 ? " PCN logged" : " PCNs logged"} · stored PCNs, replacing the spreadsheet</div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex flex-1 md:flex-none items-center gap-2 bg-paper border-[1.5px] border-line rounded-[9px] px-3">
          <span className="font-spline font-semibold text-xs text-sand">⌕</span>
          <input value={state.q} onChange={onSearch} placeholder="Search reg, PCN, authority, driver" className="border-none outline-none bg-transparent font-hanken font-medium text-[16px] md:text-xs text-ink w-full md:w-[220px] py-[9px] px-[2px]" />
        </div>
        <div className="flex shrink-0 items-center gap-2 font-spline font-bold text-[11px] tracking-[0.5px] text-paper bg-accent px-[15px] py-[9px] rounded-[9px] cursor-pointer -rotate-[1deg] shadow-[0_2px_0_rgba(120,40,30,0.35)] whitespace-nowrap" onClick={openCapture}>＋ ADD PCN</div>
      </div>
    </div>

    <div className="flex items-center gap-2 px-4 md:px-6 pb-[14px]">
      {(["all", "council", "private"] as const).map((key) => (
        <div key={key} className={`font-hanken font-semibold text-[11px] px-[13px] py-[7px] rounded-[7px] cursor-pointer border ${state.cat === key ? "bg-ink text-paper border-ink" : "bg-paper text-muted border-line"}`} onClick={() => setCat(key)}>{key === "all" ? "All" : key === "council" ? "Council" : "Private"}</div>
      ))}
    </div>

    <div className="flex justify-end px-4 pb-2 md:hidden">
      <div className="font-spline font-medium text-[9px] tracking-[1px] text-sand bg-paper border border-line rounded-md px-2.5 py-1.5 cursor-pointer" onClick={toggleDiscounted} title="Toggle full / discounted cost (council)">{state.showDiscounted ? "DISCOUNTED" : "FULL COST"} ⇄</div>
    </div>

    <div className="px-4 pb-6 md:px-6">
      <div className={`hidden md:grid ${GRID_COLS} gap-3 font-spline font-medium text-[9px] tracking-[1px] text-sand px-3 pb-[9px] border-b-[1.5px] border-ink`}>
        <span className="cursor-pointer" onClick={() => toggleSort("reg")}>VEHICLE {mark("reg")}</span>
        <span>PCN NUMBER</span>
        <span className="cursor-pointer" onClick={() => toggleSort("authority")}>AUTHORITY · DRIVER {mark("authority")}</span>
        <span>CATEGORY</span>
        <span className="cursor-pointer" onClick={() => toggleSort("date")}>DATE OF PCN {mark("date")}</span>
        <span className="text-right cursor-pointer" onClick={toggleDiscounted} title="Toggle full / discounted cost (council)">{state.showDiscounted ? "DISCOUNTED" : "FULL COST"}</span>
      </div>

      {rows.map((p) => (
        <div key={p.id}
          className={`grid grid-cols-2 ${GRID_COLS} gap-x-3 gap-y-1 md:gap-3 items-center p-3 md:px-3 cursor-pointer rounded-[10px] md:rounded-[7px] border border-line-soft md:border-x-0 md:border-t-0 mb-2.5 md:mb-0 md:hover:bg-field ${p.id === state.newId ? "bg-[#fff6df]" : "bg-paper md:bg-transparent"}`}
          onClick={() => openDetail(p.id)}>
          <span className="order-1 md:order-none font-spline font-semibold text-[12.5px]">{p.vehicleReg}</span>
          <span className="order-3 md:order-none font-spline font-medium text-[11.5px] text-muted">{p.pcnNumber}</span>
          <span className="order-5 md:order-none col-span-2 md:col-span-1 truncate font-medium text-[12.5px]">{p.authority} <span className="text-[#bcb3a0]">·</span> <span className="text-faint font-normal">{p.driverName || "— unassigned"}</span></span>
          <span className="order-4 md:order-none justify-self-end md:justify-self-auto"><span className={`font-spline font-semibold text-[9px] tracking-[0.5px] px-2 py-[3px] rounded ${catCls(p.category)}`}>{p.category}</span></span>
          <span className="order-6 md:order-none col-span-2 md:col-span-1 font-spline font-medium text-[11.5px] text-muted">{fmtDate(p.dateOfPcn)}</span>
          <span className="order-2 md:order-none text-right font-spline font-semibold text-[12.5px]">{rowCost(p)}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="text-center py-10 text-sand text-[13px]">No PCNs match — clear the search or add a PCN.</div>}
    </div>
  </div>
)}
```

Card layout (mobile order): row 1 = reg | cost, row 2 = pcn-number | category chip, row 3 = authority·driver (span 2), row 4 = date (span 2). Register rows lose the `Hover` wrapper — `md:hover:bg-field` replaces it (`md:` so it can't fight `bg-paper` on mobile; touch has no hover). Note `chip()`, `GRID`, and both `Hover` usages here are gone; `Hover` itself is deleted in Task 4 (capture still uses it until then). `mark()`, `toggleSort`, `toggleDiscounted`, `rowCost`, `catCls` unchanged.

- [ ] **Step 3: Verify**

```bash
npm run build
grep -n "chip(\|GRID =" components/pcn-portal.tsx
```
Expected: build success; grep finds nothing.

- [ ] **Step 4: Commit**

```bash
git add components/pcn-portal.tsx
git commit -m "refactor: tailwind register, mobile card list"
```

---

### Task 4: Capture view (add a PCN + check & save)

**Files:**
- Modify: `components/pcn-portal.tsx` (the `{state.view === "capture" && …}` block; delete `Hover` component)

**Interfaces:**
- Consumes: `LABEL_CLS`, `INPUT_MONO_CLS`, `INPUT_HANKEN_CLS` (Task 2). `capField`, `setCapCat`, `capSave`, `capReset`, `capManual`, `onFile`, `dupe` unchanged.
- Produces: nothing new; after this task `Hover` has zero usages → delete it here.

- [ ] **Step 1: Replace the capture block** with:

```tsx
{/* CAPTURE */}
{state.view === "capture" && (
  <div className="px-4 pt-5 pb-7 md:px-6 min-h-[460px]">
    <div className="flex items-center gap-3.5 mb-1.5">
      <div className="font-spline font-semibold text-xs text-faint cursor-pointer" onClick={goRegister}>← register</div>
      <div className="h-[22px] w-px bg-line" />
      <div className="font-spectral font-semibold text-[19px]">Add a PCN</div>
    </div>
    <div className="text-xs text-faint mb-5 max-w-[560px]">Take a photo of the PCN or upload one — the details are read off automatically. <b>Nothing is saved until you check the fields and press Save.</b> No driver name is read from the image.</div>

    <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-6 items-start">
      <div>
        {state.capStage === "idle" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col items-center justify-center gap-[11px] h-[188px] bg-accent rounded-[13px] cursor-pointer text-center p-[18px] text-paper hover:brightness-[1.06]">
              <div className="w-11 h-11 border-[1.5px] border-[#f0d9cf] rounded-[9px] flex items-center justify-center font-spline font-bold text-lg -rotate-[4deg]">▣</div>
              <div className="font-hanken font-bold text-sm">Take a photo</div>
              <div className="text-[10.5px] text-[#f0d9cf]">Use the camera to snap the PCN</div>
              <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            </label>
            <label className="flex items-center justify-center gap-2.5 h-16 bg-paper border-[1.5px] border-dashed border-[#d8cfbd] rounded-[13px] cursor-pointer text-center font-hanken font-semibold text-[13px] text-muted hover:border-accent">
              <span className="font-spline font-bold text-[15px] text-accent">↑</span> Upload an image
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
            <div className="text-center font-hanken font-medium text-[11px] text-sand pt-1 cursor-pointer" onClick={capManual}>or enter the details manually</div>
          </div>
        )}
        {state.capStage === "extracting" && (
          <div className="flex flex-col items-center justify-center gap-[15px] h-[280px] bg-[#1b1714] rounded-[13px] text-[#efe9dd]">
            <span className="w-[30px] h-[30px] border-[3px] border-[#4a3f37] border-t-[#c9a98a] rounded-full animate-[rdspin_0.8s_linear_infinite]" />
            <div className="font-hanken font-semibold text-[13px]">Reading the PCN…</div>
            <div className="font-spline font-medium text-[10px] text-[#9a8d80]">{state.capFileName}</div>
          </div>
        )}
        {state.capStage === "draft" && (
          <div>
            {state.capPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.capPreview} alt="captured PCN" className="w-full rounded-[13px] border border-line block max-h-[220px] object-contain md:max-h-none" />
            ) : (
              <div className="h-[220px] rounded-[13px] border border-dashed border-[#d8cfbd] bg-[repeating-linear-gradient(45deg,#f6f1e6,#f6f1e6_9px,#f1ebdd_9px,#f1ebdd_18px)] flex items-center justify-center font-spline font-medium text-[10px] text-[#b3a892]">manual entry — no image</div>
            )}
            <div className="text-[10.5px] text-sand mt-2">{state.capFileName}</div>
          </div>
        )}
      </div>

      {state.capStage === "draft" && state.draft ? (
        <div className="bg-paper border border-line rounded-[13px] p-4 md:px-[22px] md:py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-spectral font-semibold text-[15px]">Check &amp; save</div>
            <span className={`font-spline font-medium text-[9px] tracking-[0.6px] px-[9px] py-1 rounded-[5px] ${dupe ? "bg-[#f3e3df] text-accent" : "bg-[#eaf2ea] text-[#3f7d4e]"}`}>{dupe ? "ALREADY LOGGED" : "NEW PCN"}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-[13px]">
            <div><div className={LABEL_CLS}>PCN NUMBER</div><input value={state.draft.pcnNumber} onChange={capField("pcnNumber")} className={INPUT_MONO_CLS} /></div>
            <div><div className={LABEL_CLS}>VEHICLE REG</div><input value={state.draft.vehicleReg} onChange={capField("vehicleReg")} className={INPUT_MONO_CLS} /></div>
            <div><div className={LABEL_CLS}>ISSUING AUTHORITY</div><input value={state.draft.authority} onChange={capField("authority")} className={INPUT_HANKEN_CLS} /></div>
            <div>
              <div className={LABEL_CLS}>CATEGORY</div>
              <div className="flex gap-1.5">
                <div className={`flex-1 text-center font-hanken font-semibold text-[11px] p-2 rounded-[7px] cursor-pointer border border-line ${state.capCat === "council" ? "bg-ink text-paper" : "bg-paper text-muted"}`} onClick={() => setCapCat("council")}>council</div>
                <div className={`flex-1 text-center font-hanken font-semibold text-[11px] p-2 rounded-[7px] cursor-pointer border border-line ${state.capCat === "private" ? "bg-ink text-paper" : "bg-paper text-muted"}`} onClick={() => setCapCat("private")}>private</div>
              </div>
            </div>
            <div><div className={LABEL_CLS}>DATE OF PCN</div><input value={state.draft.dateOfPcn} onChange={capField("dateOfPcn")} placeholder="2026-06-19" className={INPUT_MONO_CLS} /></div>
            <div><div className={LABEL_CLS}>DISCOUNT PERIOD (DAYS)</div><input value={state.draft.discountPeriodDays} onChange={capField("discountPeriodDays")} placeholder="14" className={INPUT_MONO_CLS} /></div>
            {state.capCat === "council" ? (
              <>
                <div><div className={LABEL_CLS}>FULL COST (£)</div><input value={state.draft.full} onChange={capField("full")} placeholder="130" className={INPUT_MONO_CLS} /></div>
                <div><div className={LABEL_CLS}>DISCOUNTED COST (£)</div><input value={state.draft.disc} onChange={capField("disc")} placeholder="65" className={INPUT_MONO_CLS} /></div>
              </>
            ) : (
              <div><div className={LABEL_CLS}>COST OF PCN (£)</div><input value={state.draft.cost} onChange={capField("cost")} placeholder="100" className={INPUT_MONO_CLS} /></div>
            )}
            <div className="md:col-span-2"><div className={LABEL_CLS}>DRIVER · NAME ONLY (optional)</div><input value={state.draft.driverName} onChange={capField("driverName")} placeholder="Add later from the register" className={INPUT_HANKEN_CLS} /></div>
          </div>
          <div className="flex items-center gap-3 mt-[18px]">
            <div className={`flex-1 md:flex-none text-center font-spline font-bold text-xs tracking-[0.6px] px-[18px] py-3 rounded-lg cursor-pointer bg-accent text-paper -rotate-[1deg] shadow-[0_3px_0_rgba(120,40,30,0.35)]${state.saving ? " opacity-60" : ""}`} onClick={capSave}>{state.saving ? "SAVING…" : "SAVE TO REGISTER"}</div>
            <div className="font-hanken font-semibold text-xs text-faint cursor-pointer" onClick={capReset}>Discard</div>
          </div>
          {state.error && <div className="text-accent font-hanken font-medium text-[11px] mt-2">{state.error}</div>}
        </div>
      ) : (
        <div className="flex flex-col justify-center h-auto md:h-[280px] text-sand text-[12.5px] leading-[1.6] max-w-[340px]">
          <div className="font-spectral font-semibold text-[13px] text-muted mb-2">How it works</div>
          Snap or upload the PCN and the fields fill themselves in. You review and correct anything before saving — what you save is what gets stored. The register checks the PCN number so you don&apos;t log the same PCN twice.
        </div>
      )}
    </div>
  </div>
)}
```

(The idle tiles were the last two `Hover` usages — now plain `<label>`s with `hover:brightness-[1.06]` / `hover:border-accent`. Note the "manual entry — no image" placeholder has no letter-spacing in the original, unlike detail's "no PCN image" which has `tracking-[1px]` — both reproduced exactly.)

- [ ] **Step 2: Delete the `Hover` component** (lines defining `function Hover…`). It has no remaining usages.

- [ ] **Step 3: Verify**

```bash
npm run build
grep -n "Hover" components/pcn-portal.tsx
```
Expected: build success; grep finds nothing.

- [ ] **Step 4: Commit**

```bash
git add components/pcn-portal.tsx
git commit -m "refactor: tailwind capture view, mobile single column"
```

---

### Task 5: Detail view + reset dialog + delete legacy styling machinery

**Files:**
- Modify: `components/pcn-portal.tsx` (detail block, dialog block, `Field` component; delete `css`, `cssCache`, `merge`, `catBg`, `catFg`, old `LABEL`, `INPUT_MONO`, `INPUT_HANKEN`)

**Interfaces:**
- Consumes: `LABEL_CLS`, `INPUT_MONO_CLS`, `INPUT_HANKEN_CLS`, `catCls`.
- Produces: `Field` signature changes to `{ label, value, vcls }` (className string instead of style string). Detail view is its only consumer.

- [ ] **Step 1: Rewrite `Field`:**

```tsx
function Field({ label, value, vcls }: { label: string; value: React.ReactNode; vcls: string }) {
  return <div><div className={LABEL_CLS}>{label}</div><div className={vcls}>{value}</div></div>;
}
```

- [ ] **Step 2: Replace the detail block** with:

```tsx
{/* DETAIL + EDIT */}
{state.view === "detail" && d && (
  <div className="px-4 pt-4 pb-6 md:px-6 md:pt-[18px] md:pb-[26px]">
    <div className="flex flex-wrap items-center gap-3.5 mb-[18px]">
      <div className="font-spline font-semibold text-xs text-faint cursor-pointer" onClick={goRegister}>← register</div>
      <div className="h-6 w-px bg-line" />
      <div className="font-spline font-bold text-[19px] tracking-[0.5px]">{d.vehicleReg}</div>
      <span className={`font-spline font-semibold text-[9px] tracking-[0.6px] px-2 py-[3px] rounded ${catCls(d.category)}`}>{d.category}</span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-[1.25fr_1fr] gap-6 items-start">
      <div className="bg-paper border border-line rounded-[11px] p-4 md:px-[22px] md:py-5">
        <div className="font-spectral font-semibold text-sm mb-4">Stored record</div>
        <div className="grid grid-cols-2 gap-x-[22px] gap-y-4">
          <Field label="PCN NUMBER" value={d.pcnNumber} vcls="font-spline font-semibold text-sm" />
          <Field label="ISSUING AUTHORITY" value={d.authority} vcls="font-medium text-sm" />
          <Field label="VEHICLE REG" value={d.vehicleReg} vcls="font-spline font-semibold text-sm" />
          <Field label="DATE OF PCN" value={fmtDate(d.dateOfPcn)} vcls="font-spline font-medium text-sm" />
          <Field label="DISCOUNT PERIOD" value={d.discountPeriodDays != null ? `${d.discountPeriodDays} days` : "—"} vcls="font-spline font-medium text-sm" />
          {d.category === "council" ? (
            <>
              <Field label="FULL COST" value={gbp(d.fullCostPence)} vcls="font-spline font-semibold text-sm" />
              <Field label="DISCOUNTED COST" value={gbp(d.discountedCostPence)} vcls="font-spline font-semibold text-sm" />
            </>
          ) : (
            <Field label="COST OF PCN" value={gbp(d.costPence)} vcls="font-spline font-semibold text-sm" />
          )}
        </div>

        <div className="mt-[18px] pt-4 border-t border-line-soft grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-[13px]">
          <div><div className={LABEL_CLS}>DRIVER (name only)</div><input value={state.edit.driverName} onChange={editField("driverName")} placeholder="—" className={INPUT_HANKEN_CLS} /></div>
          <div><div className={LABEL_CLS}>STATUS</div><input value={state.edit.status} onChange={editField("status")} placeholder="e.g. Paid, Appeal submitted" className={INPUT_HANKEN_CLS} /></div>
          {d.category === "council" && (
            <>
              <div><div className={LABEL_CLS}>ALI PAID?</div><input value={state.edit.aliPaid} onChange={editField("aliPaid")} className={INPUT_MONO_CLS} /></div>
              <div><div className={LABEL_CLS}>MONEY REQUESTED?</div><input value={state.edit.moneyRequested} onChange={editField("moneyRequested")} className={INPUT_MONO_CLS} /></div>
              <div><div className={LABEL_CLS}>DRIVER PAID?</div><input value={state.edit.driverPaid} onChange={editField("driverPaid")} className={INPUT_MONO_CLS} /></div>
            </>
          )}
          <div className="md:col-span-2"><div className={LABEL_CLS}>NOTES</div><textarea value={state.edit.notes} onChange={editField("notes")} rows={2} className={INPUT_HANKEN_CLS} /></div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className={`font-spline font-bold text-xs tracking-[0.6px] px-4 py-[11px] rounded-lg cursor-pointer bg-accent text-paper shadow-[0_3px_0_rgba(120,40,30,0.35)]${state.saving ? " opacity-60" : ""}`} onClick={saveEdit}>{state.saving ? "SAVING…" : "SAVE CHANGES"}</div>
        </div>
        {state.error && <div className="text-accent font-hanken font-medium text-[11px] mt-2">{state.error}</div>}
      </div>

      <div>
        <div className="font-spline font-medium text-[9px] tracking-[0.8px] text-sand mb-[9px]">PCN ON FILE</div>
        {d.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/pcn-image/${d.id}`} alt="PCN on file" className="w-full rounded-[11px] border border-line block" />
        ) : (
          <div className="w-full h-[280px] rounded-[11px] border border-dashed border-[#d8cfbd] bg-[repeating-linear-gradient(45deg,#f6f1e6,#f6f1e6_9px,#f1ebdd_9px,#f1ebdd_18px)] flex items-center justify-center font-spline font-medium text-[10px] text-[#b3a892] tracking-[1px]">no PCN image</div>
        )}
        <div className="text-[10.5px] text-sand mt-2 leading-normal">Held in private storage for audit.</div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Replace the reset dialog block** with:

```tsx
{(state.importStage === "confirm" || state.importStage === "resetting") && state.importPreview && (
  <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4">
    <div className="bg-paper border border-line rounded-[13px] px-6 py-[22px] w-full max-w-[440px] max-h-[85vh] overflow-auto shadow-[0_12px_40px_rgba(33,29,24,0.25)]">
      <div className="font-spectral font-semibold text-base mb-2.5">Reset register from file?</div>
      <div className="text-[12.5px] text-muted leading-[1.6]">
        Replace the {state.importPreview.currentRows} PCN{state.importPreview.currentRows === 1 ? "" : "s"} in the register with {state.importPreview.fileRows} from the file ({state.importPreview.privateCount} private + {state.importPreview.councilCount} council)? Changes made in the app will be lost. Letter images are kept where the PCN number still matches.
      </div>
      {state.importError && <div className="text-accent font-hanken font-medium text-[11px] mt-2.5">{state.importError}</div>}
      <div className="flex items-center justify-end gap-4 mt-[18px]">
        <div className="font-hanken font-semibold text-xs text-faint cursor-pointer" onClick={cancelImport}>Cancel</div>
        <div className={`font-spline font-bold text-xs tracking-[0.6px] px-4 py-[11px] rounded-lg cursor-pointer bg-accent text-paper shadow-[0_3px_0_rgba(120,40,30,0.35)]${state.importStage === "resetting" ? " opacity-60" : ""}`} onClick={confirmReset}>{state.importStage === "resetting" ? "RESETTING…" : "RESET REGISTER"}</div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Delete dead machinery:** `cssCache`, `css()`, `merge()`, `catBg`, `catFg`, old `LABEL`, `INPUT_MONO`, `INPUT_HANKEN` consts. Keep `gbp`, `fmtDate`, `MONTHS`, `emptyDraft`, all state/handlers.

- [ ] **Step 5: Verify no legacy styling remains**

```bash
npm run build
grep -n "css(\|merge(\|style={" components/pcn-portal.tsx
```
Expected: build success; grep finds nothing (no `css(`, `merge(`, or `style={` left).

- [ ] **Step 6: Run existing tests**

```bash
npm test
```
Expected: all vitest suites pass (they cover `lib/` only; proves no accidental import breakage).

- [ ] **Step 7: Commit**

```bash
git add components/pcn-portal.tsx
git commit -m "refactor: tailwind detail + reset dialog, drop css() helpers"
```

---

### Task 6: Verification pass (build, tests, visual)

**Files:** none expected (fixes only if checks fail).

- [ ] **Step 1: Full builds**

```bash
npm test && npm run build
```
Expected: both pass.

- [ ] **Step 2: Viewport meta present**

```bash
npm run dev &   # then:
curl -s http://localhost:3000/login | grep -o '<meta name="viewport"[^>]*>'
```
Expected: `<meta name="viewport" content="width=device-width, initial-scale=1"/>` (Next default).

- [ ] **Step 3: Visual checklist** — with a browser (device emulation 390px + desktop 1280px). If the executing agent cannot drive a browser, present this checklist to the user verbatim and wait:

**1280px (must look identical to pre-change):** navbar full buttons + GDPR text · register 6-col table with sortable headers · capture two-column · detail two-column · reset dialog centred 440px.

**390px:** no horizontal scroll anywhere · navbar one row, ↥/↧ icon squares, no GDPR text · register: title, then full-width search + ADD PCN, chips, FULL COST/DISCOUNTED toggle chip right-aligned, cards (reg+cost / number+chip / authority·driver / date) · tapping a card opens detail, single column, edit inputs stacked, notes full width · add-PCN: tiles full width; after photo/manual: preview ≤220px, check & save below, fields stacked, driver/notes full width, SAVE TO REGISTER stretches with Discard beside · focusing any input does NOT zoom the page (16px fonts) · import → reset dialog fits with 16px margin, scrolls if tall · login page unchanged/usable.

- [ ] **Step 4: Commit (only if fixes were needed)**

```bash
git add -A && git commit -m "fix: mobile polish from visual pass"
```

---

## Self-Review Notes

- Spec coverage: setup (T1), navbar (T2), register toolbar/toggle/cards (T3), capture + check&save + iOS zoom via INPUT_BASE (T2 def, T4/T5 usage), detail (T5), dialog (T5), machinery deletion (T4/T5), testing (T6), login preflight check (T1 note + T6). Non-goals respected: no sorting UI on mobile, no lightbox, no component library.
- `text-[16px] md:text-xs` in `INPUT_BASE` + search input implements the ≥16px rule; all other text is display-only (zoom only triggers on focusable text controls).
- `md:hover:bg-field` (not bare `hover:`) on register rows avoids the mobile `bg-paper` conflict.
