"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PcnView } from "@/lib/pcn/view";
import { createPcn, updatePcn, previewReset, resetFromXlsx } from "@/app/actions";
import { poundsToPence } from "@/lib/convert";
import { STATUSES, DEFAULT_STATUS } from "@/lib/pcn/status";

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

const LABEL_CLS = "font-spline font-medium text-[9px] tracking-[0.8px] text-sand mb-[5px]";
const INPUT_BASE = "w-full bg-field border border-line rounded-[7px] px-[11px] py-[9px] font-semibold text-[16px] md:text-xs text-ink outline-none";
const INPUT_MONO_CLS = `${INPUT_BASE} font-spline`;
const INPUT_HANKEN_CLS = `${INPUT_BASE} font-hanken`;
const catCls = (c: string) => c === "council" ? "bg-[#e7eef0] text-[#3a5a66]" : "bg-[#f3e3df] text-accent";
const GRID_COLS = "md:grid-cols-[96px_138px_1fr_78px_116px_70px]";
function Field({ label, value, vcls }: { label: string; value: React.ReactNode; vcls: string }) {
  return <div className="min-w-0"><div className={LABEL_CLS}>{label}</div><div className={`${vcls} break-words`}>{value}</div></div>;
}
function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Legacy free-text statuses (e.g. from an xlsx import) stay selectable so they aren't silently lost.
  const opts: string[] = value && !(STATUSES as readonly string[]).includes(value) ? [value, ...STATUSES] : [...STATUSES];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT_BASE} font-hanken cursor-pointer`}>
      {!value && <option value="">— set status</option>}
      {opts.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

type Category = "council" | "private";
interface Draft { pcnNumber: string; authority: string; vehicleReg: string; dateOfPcn: string; discountPeriodDays: string; full: string; disc: string; cost: string; driverName: string; status: string }
function emptyDraft(): Draft { return { pcnNumber: "", authority: "", vehicleReg: "", dateOfPcn: "", discountPeriodDays: "", full: "", disc: "", cost: "", driverName: "", status: DEFAULT_STATUS }; }

interface State {
  view: "register" | "detail" | "capture";
  q: string; cat: "all" | Category; sort: "logged" | "reg" | "authority" | "date"; sortDir: number;
  showDiscounted: boolean; selectedId: string | null; newId: string | null; pcns: PcnView[];
  capStage: "idle" | "extracting" | "draft"; capFileName: string | null; capPreview: string | null; capImageUrl: string | null;
  capCat: Category; draft: Draft | null; dupeStatus: string | null; edit: Record<string, string>; saving: boolean;
  error: string | null;
  importStage: "idle" | "parsing" | "confirm" | "resetting";
  importPreview: { fileRows: number; privateCount: number; councilCount: number; currentRows: number } | null;
  importError: string | null;
}

export default function PcnPortal({ initialPcns }: { initialPcns: PcnView[] }) {
  const router = useRouter();
  const [state, setState] = useState<State>(() => ({
    view: "register", q: "", cat: "all", sort: "logged", sortDir: -1, showDiscounted: false,
    selectedId: null, newId: null, pcns: initialPcns,
    capStage: "idle", capFileName: null, capPreview: null, capImageUrl: null, capCat: "council",
    draft: null, dupeStatus: null, edit: {}, saving: false, error: null,
    importStage: "idle", importPreview: null, importError: null,
  }));
  const update = useCallback((patch: Partial<State> | ((s: State) => Partial<State>)) =>
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), []);

  const byId = (id: string | null) => state.pcns.find((p) => p.id === id) || null;

  /* nav */
  const goRegister = () => update({ view: "register", error: null });
  const openDetail = (id: string) => {
    const p = state.pcns.find((x) => x.id === id)!;
    update({ view: "detail", selectedId: id, error: null, edit: {
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
  const openCapture = () => update({ view: "capture", capStage: "idle", draft: null, dupeStatus: null, capFileName: null, capPreview: null, capImageUrl: null });
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
      .then((data: { imageUrl: string | null; extracted: any; error?: string }) => {
        if (data.error) {
          update({ capStage: "draft", capImageUrl: null, capCat: "council", draft: emptyDraft(), error: "Image upload failed — fill in the fields manually." });
          return;
        }
        const ex = data.extracted || {};
        update({
          capStage: "draft", capImageUrl: data.imageUrl, error: null,
          capCat: ex.category === "private" ? "private" : "council",
          draft: {
            pcnNumber: ex.pcnNumber ?? "", authority: ex.authority ?? "", vehicleReg: ex.vehicleReg ?? "",
            dateOfPcn: ex.dateOfPcn ?? "", discountPeriodDays: ex.discountPeriodDays != null ? String(ex.discountPeriodDays) : "",
            full: ex.fullCost != null ? String(ex.fullCost) : "", disc: ex.discountedCost != null ? String(ex.discountedCost) : "",
            cost: ex.cost != null ? String(ex.cost) : "", driverName: "", status: DEFAULT_STATUS,
          },
        });
      })
      .catch(() => update({ capStage: "draft", draft: emptyDraft() }));
  };
  const capField = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update((s) => ({ draft: { ...(s.draft ?? emptyDraft()), [k]: e.target.value }, ...(k === "pcnNumber" ? { dupeStatus: null } : {}) }));
  const setCapCat = (c: Category) => update({ capCat: c });
  const capReset = () => update({ capStage: "idle", draft: null, dupeStatus: null, capFileName: null, capPreview: null, capImageUrl: null, error: null });
  const capSave = async () => {
    const d = state.draft; if (!d || state.saving) return;
    update({ saving: true, error: null });
    const council = state.capCat === "council";
    const pence = (s: string) => { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(n) ? null : poundsToPence(n); };
    try {
      const view = await createPcn({
        category: state.capCat, pcnNumber: d.pcnNumber || "(unnumbered)", authority: d.authority || "—",
        vehicleReg: (d.vehicleReg || "").toUpperCase() || "—",
        costPence: council ? null : pence(d.cost), fullCostPence: council ? pence(d.full) : null,
        discountedCostPence: council ? pence(d.disc) : null,
        dateOfPcn: d.dateOfPcn || null, discountPeriodDays: d.discountPeriodDays ? parseInt(d.discountPeriodDays, 10) : null,
        driverName: (d.driverName || "").trim() || null, status: d.status || DEFAULT_STATUS, notes: null, imageUrl: state.capImageUrl,
      });
      update((s) => ({ pcns: [view, ...s.pcns], view: "register", newId: view.id, saving: false, capStage: "idle", draft: null, dupeStatus: null, capPreview: null, capImageUrl: null, error: null }));
      router.refresh();
    } catch { update({ saving: false, error: "Couldn't save — try again." }); }
  };

  /* detail edit */
  const editField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update((s) => ({ edit: { ...s.edit, [k]: e.target.value } }));
  const saveEdit = async () => {
    const id = state.selectedId; if (!id || state.saving) return;
    update({ saving: true, error: null });
    const e = state.edit;
    const patch: any = { status: e.status || null, driverName: e.driverName || null, notes: e.notes || null };
    const p = byId(id);
    if (p?.category === "council") { patch.aliPaid = e.aliPaid || null; patch.moneyRequested = e.moneyRequested || null; patch.driverPaid = e.driverPaid || null; }
    try {
      const view = await updatePcn(id, patch);
      update((s) => ({ pcns: s.pcns.map((x) => (x.id === id ? view : x)), saving: false, error: null }));
      router.refresh();
    } catch { update({ saving: false, error: "Couldn't save — try again." }); }
  };

  /* import / reset from xlsx */
  const importFileRef = useRef<File | null>(null);
  const toFd = (f: File) => { const fd = new FormData(); fd.append("file", f); return fd; };
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f || state.importStage !== "idle") return;
    importFileRef.current = f;
    update({ importStage: "parsing", importError: null });
    try {
      const res = await previewReset(toFd(f));
      if (res.ok) update({ importStage: "confirm", importPreview: res });
      else { importFileRef.current = null; update({ importStage: "idle", importError: res.error }); }
    } catch {
      importFileRef.current = null;
      update({ importStage: "idle", importError: "Couldn't read that file — try again." });
    }
  };
  const cancelImport = () => {
    if (state.importStage === "resetting") return;
    importFileRef.current = null;
    update({ importStage: "idle", importPreview: null, importError: null });
  };
  const confirmReset = async () => {
    const f = importFileRef.current;
    if (!f || state.importStage === "resetting") return;
    update({ importStage: "resetting", importError: null });
    try {
      const res = await resetFromXlsx(toFd(f));
      if (res.ok) {
        importFileRef.current = null;
        update({ pcns: res.pcns, importStage: "idle", importPreview: null, importError: null, view: "register", selectedId: null, newId: null, error: null });
        router.refresh();
      } else {
        update({ importStage: "confirm", importError: res.error }); // keep dialog open, show error, allow retry/cancel
      }
    } catch {
      update({ importStage: "confirm", importError: "Couldn't reset — try again." });
    }
  };

  /* view-models */
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

  const total = state.pcns.length;
  const rows = registerRows();
  const d = byId(state.selectedId);
  const dupeOf = (state.draft && state.pcns.find((p) => p.pcnNumber.toLowerCase() === state.draft!.pcnNumber.trim().toLowerCase())) || null;
  const dupe = !!dupeOf;

  /* scanned ticket already logged → update the existing record's status instead */
  const dupeSaveStatus = async () => {
    if (!dupeOf || state.saving) return;
    update({ saving: true, error: null });
    try {
      const view = await updatePcn(dupeOf.id, { status: (state.dupeStatus ?? dupeOf.status) || null });
      update((s) => ({ pcns: s.pcns.map((x) => (x.id === view.id ? view : x)), view: "register", newId: view.id, saving: false, capStage: "idle", draft: null, dupeStatus: null, capPreview: null, capImageUrl: null, error: null }));
      router.refresh();
    } catch { update({ saving: false, error: "Couldn't update — try again." }); }
  };

  return (
    <div className="min-h-screen bg-cream font-hanken text-ink">
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

      <main className="max-w-[1020px] mx-auto">
        {state.importError && state.importStage === "idle" && (
          <div className="px-4 md:px-6 pt-3 text-accent font-hanken font-medium text-[11px]">{state.importError}</div>
        )}
        {/* REGISTER */}
        {state.view === "register" && (
          <div>
            <div className="flex flex-col gap-3 px-4 pt-4 pb-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:pt-[18px] md:pb-[14px]">
              <div>
                <div className="font-spectral font-semibold text-xl">PCN register</div>
                <div className="text-[11.5px] text-faint mt-[2px]">{total}{total === 1 ? " PCN logged" : " PCNs logged"} · stored PCNs, replacing the spreadsheet</div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex flex-1 min-w-0 md:flex-none items-center gap-2 bg-paper border-[1.5px] border-line rounded-[9px] px-3">
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
                  className={`grid grid-cols-2 ${GRID_COLS} gap-x-3 gap-y-1 md:gap-3 items-center p-3 cursor-pointer rounded-[10px] md:rounded-[7px] border border-line-soft md:border-x-0 md:border-t-0 mb-2.5 md:mb-0 md:hover:bg-field ${p.id === state.newId ? "bg-[#fff6df]" : "bg-paper md:bg-transparent"}`}
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
                  <div><div className={LABEL_CLS}>STATUS</div><StatusSelect value={state.edit.status} onChange={(v) => update((s) => ({ edit: { ...s.edit, status: v } }))} /></div>
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
                    <div><div className={LABEL_CLS}>STATUS</div><StatusSelect value={state.draft.status} onChange={(v) => update((s) => ({ draft: { ...(s.draft ?? emptyDraft()), status: v } }))} /></div>
                    <div><div className={LABEL_CLS}>DRIVER · NAME ONLY (optional)</div><input value={state.draft.driverName} onChange={capField("driverName")} placeholder="Add later from the register" className={INPUT_HANKEN_CLS} /></div>
                  </div>
                  {dupeOf && (
                    <div className="mt-4 border border-[#e7c9c0] bg-[#faf1ee] rounded-[9px] p-3.5">
                      <div className="font-hanken font-semibold text-xs text-accent mb-1">This PCN is already in the register</div>
                      <div className="text-[11.5px] text-muted leading-normal mb-2.5">{dupeOf.vehicleReg} · {dupeOf.authority} · logged {fmtDate(dupeOf.dateOfPcn)} · current status: <b>{dupeOf.status || "—"}</b>. Update its status instead of adding a duplicate:</div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2.5 items-center">
                        <StatusSelect value={state.dupeStatus ?? (dupeOf.status || "")} onChange={(v) => update({ dupeStatus: v })} />
                        <div className={`text-center font-spline font-bold text-[11px] tracking-[0.6px] px-3.5 py-[10px] rounded-lg cursor-pointer bg-accent text-paper shadow-[0_2px_0_rgba(120,40,30,0.35)]${state.saving ? " opacity-60" : ""}`} onClick={dupeSaveStatus}>{state.saving ? "UPDATING…" : "UPDATE STATUS"}</div>
                        <div className="text-center font-hanken font-semibold text-xs text-faint cursor-pointer" onClick={() => openDetail(dupeOf.id)}>open record</div>
                      </div>
                    </div>
                  )}
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
      </main>
    </div>
  );
}
