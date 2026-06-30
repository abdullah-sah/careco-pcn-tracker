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
