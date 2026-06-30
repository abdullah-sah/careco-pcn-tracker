"use client";

import React, { useCallback, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Category = "council" | "private";

interface Ticket {
  id: string;
  category: Category;
  pcnNumber: string;
  authority: string;
  vehicleReg: string;
  driver: string | null;
  dateOfContravention: string;
  dateOfNotice: string;
  fullCostPence: number | null;
  discountedCostPence: number | null;
  loggedOn: string;
  notes: string;
  image: string | null;
  fileName: string;
}

interface Draft {
  pcn: string;
  reg: string;
  authority: string;
  doc: string;
  don: string;
  full: string;
  disc: string;
  driver: string;
}

interface State {
  view: "register" | "detail" | "capture";
  q: string;
  cat: "all" | Category;
  sort: "logged" | "reg" | "authority" | "date";
  sortDir: number;
  selectedId: string | null;
  newId: string | null;
  capStage: "idle" | "extracting" | "draft";
  capFileName: string | null;
  capImage: string | null;
  capCat: Category;
  draft: Draft | null;
  showDiscounted: boolean;
  tickets: Ticket[];
}

/* ------------------------------------------------------------------ */
/*  Pure helpers (ported verbatim from the design's DCLogic)          */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function gbp(p: number | null | undefined): string {
  if (p == null) return "—";
  const n = p / 100;
  return (
    "£" +
    n.toLocaleString("en-GB", {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = String(iso).split("-");
  if (p.length < 3) return String(iso);
  return parseInt(p[2], 10) + " " + (MONTHS[parseInt(p[1], 10) - 1] || "") + " " + p[0];
}

function poundsToPence(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : Math.round(n * 100);
}

function emptyDraft(): Draft {
  return { pcn: "", reg: "", authority: "", doc: "", don: "", full: "", disc: "", driver: "" };
}

function mkTicket(
  id: string,
  category: Category,
  pcnNumber: string,
  authority: string,
  vehicleReg: string,
  driver: string | null,
  dateOfContravention: string,
  dateOfNotice: string,
  fullCostPence: number,
  discountedCostPence: number,
  loggedOn: string,
  notes: string,
): Ticket {
  return {
    id,
    category,
    pcnNumber,
    authority,
    vehicleReg,
    driver: driver || null,
    dateOfContravention,
    dateOfNotice,
    fullCostPence,
    discountedCostPence,
    loggedOn,
    notes: notes || "",
    image: null,
    fileName: "(no image — legacy import)",
  };
}

const SEED: Ticket[] = [
  mkTicket("t-1042", "council", "PCN1138842A", "Westminster", "BV68 KMO", "Mohammed A.", "2026-06-15", "2026-06-20", 13000, 6500, "2026-06-18", "Letter handed in at the office."),
  mkTicket("t-1043", "council", "CM2240117", "Lambeth", "LG20 ELT", "Rashid K.", "2026-06-12", "2026-06-19", 13000, 6500, "2026-06-21", ""),
  mkTicket("t-1044", "private", "PE-7741920", "ParkingEye", "KP18 OHV", "Samuel O.", "2026-05-29", "2026-06-06", 10000, 6000, "2026-06-09", "Private car park — Stratford retail."),
  mkTicket("t-1045", "council", "CN1180334", "Camden", "YD67 WPJ", "Tariq H.", "2026-06-21", "2026-06-25", 13000, 6500, "2026-06-25", ""),
  mkTicket("t-1046", "private", "UKPC-553201", "UKPC", "RK19 BNF", "Daniel I.", "2026-05-22", "2026-05-30", 10000, 6000, "2026-05-31", ""),
  mkTicket("t-1047", "council", "TFL-GL90021188", "Transport for London", "MA19 ZTC", "Idris B.", "2026-06-18", "2026-06-22", 16000, 8000, "2026-06-22", "TfL bus lane."),
  mkTicket("t-1048", "council", "CR2290771", "Croydon", "VN18 LXP", null, "2026-06-25", "2026-06-28", 13000, 6500, "2026-06-28", ""),
  mkTicket("t-1049", "council", "IS1170452", "Islington", "CE19 RMD", null, "2026-06-26", "2026-06-29", 13000, 6500, "2026-06-29", ""),
  mkTicket("t-1050", "council", "SK2118890", "Southwark", "SC18 AKD", "Hassan M.", "2026-05-08", "2026-05-12", 13000, 6500, "2026-05-12", ""),
  mkTicket("t-1051", "private", "ECP-330018", "Euro Car Parks", "WX19 FLD", "Omar T.", "2026-05-15", "2026-05-19", 10000, 6000, "2026-05-19", ""),
];

/* ------------------------------------------------------------------ */
/*  Inline-style helper — keeps the design's CSS strings verbatim     */
/* ------------------------------------------------------------------ */

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
    const key = rawKey.startsWith("--")
      ? rawKey
      : rawKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    // The design uses bare `font:<weight> <size>` shorthands that omit the
    // family; re-attach the inherited family so the size/weight actually apply.
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

/* Hover wrapper — replaces the design's non-standard `style-hover` attribute. */
function Hover({
  tag = "div",
  base,
  hover,
  children,
  ...rest
}: {
  tag?: React.ElementType;
  base: React.CSSProperties;
  hover: React.CSSProperties;
  children?: React.ReactNode;
} & Record<string, unknown>) {
  const [on, setOn] = useState(false);
  return React.createElement(
    tag,
    {
      style: on ? { ...base, ...hover } : base,
      onMouseEnter: () => setOn(true),
      onMouseLeave: () => setOn(false),
      ...rest,
    },
    children,
  );
}

const LABEL = "font:500 9px 'Spline Sans Mono';letter-spacing:.8px;color:#a89e8c;margin-bottom:5px";
const INPUT_MONO =
  "width:100%;background:#faf6ec;border:1px solid #e2dbcd;border-radius:7px;padding:9px 11px;font:600 12px 'Spline Sans Mono';color:#211d18;outline:none";
const INPUT_HANKEN =
  "width:100%;background:#faf6ec;border:1px solid #e2dbcd;border-radius:7px;padding:9px 11px;font:600 12px 'Hanken Grotesk';color:#211d18;outline:none";

function Field({ label, value, vstyle }: { label: string; value: React.ReactNode; vstyle: string }) {
  return (
    <div>
      <div style={css(LABEL)}>{label}</div>
      <div style={css(vstyle)}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

type Props = { accent?: string; showDiscounted?: boolean };

export default function PcnPortal({ accent = "#9c3327", showDiscounted = false }: Props) {
  const [state, setState] = useState<State>(() => ({
    view: "register",
    q: "",
    cat: "all",
    sort: "logged",
    sortDir: -1,
    selectedId: null,
    newId: null,
    capStage: "idle",
    capFileName: null,
    capImage: null,
    capCat: "council",
    draft: null,
    showDiscounted,
    tickets: [...SEED],
  }));

  const update = useCallback(
    (patch: Partial<State> | ((s: State) => Partial<State>)) =>
      setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })),
    [],
  );

  /* ---- nav ---- */
  const goRegister = () => update({ view: "register" });
  const open = (id: string) => update({ view: "detail", selectedId: id });

  /* ---- search / filter / sort ---- */
  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => update({ q: e.target.value });
  const setCat = (c: State["cat"]) => update({ cat: c });
  const toggleSort = (key: State["sort"]) =>
    update((s) => ({ sort: key, sortDir: s.sort === key ? -s.sortDir : 1 }));
  const toggleDiscounted = () => update((s) => ({ showDiscounted: !s.showDiscounted }));

  /* ---- capture ---- */
  const openCapture = () =>
    update({ view: "capture", capStage: "idle", draft: null, capFileName: null, capImage: null });
  const capManual = () =>
    update({
      view: "capture",
      capStage: "draft",
      capCat: "council",
      capFileName: "manual entry",
      capImage: null,
      draft: emptyDraft(),
    });
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      update({ capStage: "extracting", capFileName: f.name, capImage: rd.result as string });
      // Simulated extraction — the real OCR call would replace this timeout.
      setTimeout(() => {
        update({
          capStage: "draft",
          capCat: "council",
          draft: {
            pcn: "LB" + (2240000 + Math.floor(Math.random() * 9000)),
            reg: "LT19 OXC",
            authority: "Lambeth",
            doc: "2026-06-19",
            don: "2026-06-24",
            full: "£130.00",
            disc: "£65.00",
            driver: "",
          },
        });
      }, 1500);
    };
    rd.readAsDataURL(f);
  };
  const capField = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update((s) => ({ draft: { ...(s.draft ?? emptyDraft()), [k]: e.target.value } }));
  const setCapCat = (c: Category) => update({ capCat: c });
  const capReset = () =>
    update({ capStage: "idle", draft: null, capFileName: null, capImage: null });
  const capSave = () => {
    const d = state.draft;
    if (!d) return;
    const cat = state.capCat;
    const id = "t-" + (1052 + Math.floor(Math.random() * 9000));
    const nt: Ticket = {
      id,
      category: cat,
      pcnNumber: d.pcn || "(unnumbered)",
      authority: d.authority || "—",
      vehicleReg: (d.reg || "").toUpperCase() || "—",
      driver: (d.driver || "").trim() || null,
      dateOfContravention: d.doc || "",
      dateOfNotice: d.don || "",
      fullCostPence: poundsToPence(d.full),
      discountedCostPence: poundsToPence(d.disc),
      loggedOn: "2026-06-30",
      notes: "",
      image: state.capImage,
      fileName: state.capFileName || "(no image)",
    };
    update((s) => ({
      tickets: [nt, ...s.tickets],
      view: "register",
      newId: id,
      capStage: "idle",
      draft: null,
      capFileName: null,
      capImage: null,
    }));
  };

  /* ---- view-models ---- */
  const registerRows = () => {
    const { q, cat, sort, sortDir } = state;
    const ql = q.trim().toLowerCase();
    const filtered = state.tickets.filter((t) => {
      if (cat !== "all" && t.category !== cat) return false;
      if (!ql) return true;
      return (t.vehicleReg + " " + t.pcnNumber + " " + t.authority + " " + (t.driver || ""))
        .toLowerCase()
        .includes(ql);
    });
    const keyOf = (t: Ticket) =>
      sort === "reg"
        ? t.vehicleReg
        : sort === "authority"
          ? t.authority
          : sort === "date"
            ? t.dateOfContravention
            : t.loggedOn + t.id;
    const sorted = [...filtered].sort((a, b) =>
      keyOf(a) < keyOf(b) ? -1 * sortDir : keyOf(a) > keyOf(b) ? 1 * sortDir : 0,
    );
    const showDisc = state.showDiscounted;
    return sorted.map((t) => ({
      id: t.id,
      reg: t.vehicleReg,
      pcn: t.pcnNumber,
      authority: t.authority,
      driver: t.driver || "— unassigned",
      category: t.category,
      catBg: t.category === "council" ? "#e7eef0" : "#f3e3df",
      catFg: t.category === "council" ? "#3a5a66" : "#9c3327",
      contravention: fmtDate(t.dateOfContravention),
      cost: gbp(showDisc ? t.discountedCostPence : t.fullCostPence),
      hl: t.id === state.newId ? "#fff6df" : "transparent",
    }));
  };

  const detailVM = () => {
    const t = state.tickets.find((x) => x.id === state.selectedId);
    if (!t) return null;
    return {
      reg: t.vehicleReg,
      pcn: t.pcnNumber,
      authority: t.authority,
      driver: t.driver || "— not yet assigned",
      category: t.category,
      catBg: t.category === "council" ? "#e7eef0" : "#f3e3df",
      catFg: t.category === "council" ? "#3a5a66" : "#9c3327",
      contravention: fmtDate(t.dateOfContravention),
      notice: fmtDate(t.dateOfNotice),
      fullCost: gbp(t.fullCostPence),
      discCost: gbp(t.discountedCostPence),
      loggedOn: fmtDate(t.loggedOn),
      notes: t.notes,
      hasNotes: !!t.notes,
      image: t.image,
      fileName: t.fileName,
    };
  };

  const captureVM = () => {
    const stage = state.capStage;
    const d = state.draft;
    let dedupe = "NEW LETTER";
    let dBg = "#eaf2ea";
    let dFg = "#3f7d4e";
    if (d && d.pcn && state.tickets.some((t) => t.pcnNumber.toLowerCase() === String(d.pcn).toLowerCase())) {
      dedupe = "ALREADY LOGGED";
      dBg = "#f3e3df";
      dFg = "#9c3327";
    }
    const cat = state.capCat;
    return {
      showDrop: stage === "idle",
      showProcessing: stage === "extracting",
      showThumb: stage === "draft",
      showDraft: stage === "draft",
      fileName: state.capFileName,
      image: state.capImage,
      draft: d ?? emptyDraft(),
      dedupe,
      dedupeBg: dBg,
      dedupeFg: dFg,
      councilBg: cat === "council" ? "#211d18" : "#fffdf8",
      councilFg: cat === "council" ? "#fffdf8" : "#6a6155",
      privateBg: cat === "private" ? "#211d18" : "#fffdf8",
      privateFg: cat === "private" ? "#fffdf8" : "#6a6155",
    };
  };

  const total = state.tickets.length;
  const rows = registerRows();
  const chip = (key: State["cat"], label: string) => ({
    key,
    label,
    bg: state.cat === key ? "#211d18" : "#fffdf8",
    fg: state.cat === key ? "#fffdf8" : "#6a6155",
    bd: state.cat === key ? "#211d18" : "#e2dbcd",
  });
  const mark = (key: State["sort"]) =>
    state.sort === key ? (state.sortDir < 0 ? "↓" : "↑") : "";

  const v = {
    accentVar: accent || "#9c3327",
    showRegister: state.view === "register",
    showDetail: state.view === "detail",
    showCapture: state.view === "capture",
    q: state.q,
    countLabel: total + (total === 1 ? " letter logged" : " letters logged"),
    catChips: [chip("all", "All"), chip("council", "Council"), chip("private", "Private")],
    costHead: state.showDiscounted ? "DISCOUNTED" : "FULL COST",
    sortMarkReg: mark("reg"),
    sortMarkAuth: mark("authority"),
    sortMarkDate: mark("date"),
    rows,
    empty: rows.length === 0,
    d: detailVM(),
    cap: captureVM(),
  };

  const GRID = "grid-template-columns:96px 138px 1fr 78px 116px 70px";

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      style={
        {
          ...css(
            "min-height:100vh;background:#f4f0e6;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#211d18",
          ),
          "--accent": v.accentVar,
        } as React.CSSProperties
      }
    >
      {/* ============ APP BAR (full-width, sticky) ============ */}
      <header style={css("position:sticky;top:0;z-index:10;background:#fffdf8;border-bottom:1px solid #e2dbcd")}>
        <div style={css("max-width:1020px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:15px 24px")}>
          <div style={css("display:flex;align-items:center;gap:12px;cursor:pointer")} onClick={goRegister}>
            <div style={css("width:34px;height:34px;border:1.5px solid var(--accent,#9c3327);border-radius:6px;display:flex;align-items:center;justify-content:center;transform:rotate(-4deg);font:700 12px 'Spline Sans Mono';color:var(--accent,#9c3327)")}>
              RD
            </div>
            <div>
              <div style={css("font:600 15px 'Spectral',serif;letter-spacing:.2px")}>Recovery Desk</div>
              <div style={css("font:500 9px 'Spline Sans Mono';color:#9a9081;letter-spacing:1.6px")}>CARECO · PCN REGISTER</div>
            </div>
          </div>
          <div style={css("display:flex;align-items:center;gap:14px")}>
            <div style={css("text-align:right;font:500 10px 'Spline Sans Mono';color:#8a8175;line-height:1.5")}>
              <div>MON 30 JUN 2026</div>
              <div style={{ color: "#b3402f" }}>UK GDPR · name-only</div>
            </div>
          </div>
        </div>
      </header>

      <main style={css("max-width:1020px;margin:0 auto")}>

        {/* ============ REGISTER ============ */}
        {v.showRegister && (
          <div>
            {/* toolbar */}
            <div style={css("display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px 14px")}>
              <div>
                <div style={css("font:600 20px 'Spectral',serif")}>PCN register</div>
                <div style={css("font:400 11.5px;color:#8a8175;margin-top:2px")}>
                  {v.countLabel} · stored letters, replacing the spreadsheet
                </div>
              </div>
              <div style={css("display:flex;align-items:center;gap:10px")}>
                <div style={css("display:flex;align-items:center;gap:8px;background:#fffdf8;border:1.5px solid #e2dbcd;border-radius:9px;padding:0 12px")}>
                  <span style={css("font:600 12px 'Spline Sans Mono';color:#a89e8c")}>⌕</span>
                  <input
                    value={v.q}
                    onChange={onSearch}
                    placeholder="Search reg, PCN, authority, driver"
                    style={css("border:none;outline:none;background:transparent;font:500 12px 'Hanken Grotesk';color:#211d18;width:220px;padding:9px 2px")}
                  />
                </div>
                <div
                  style={css("display:flex;align-items:center;gap:8px;font:700 11px 'Spline Sans Mono';letter-spacing:.5px;color:#fffdf8;background:var(--accent,#9c3327);padding:9px 15px;border-radius:9px;cursor:pointer;transform:rotate(-1deg);box-shadow:0 2px 0 rgba(120,40,30,.35)")}
                  onClick={openCapture}
                >
                  ＋ ADD LETTER
                </div>
              </div>
            </div>

            {/* filter chips */}
            <div style={css("display:flex;align-items:center;gap:8px;padding:0 24px 14px")}>
              {v.catChips.map((c) => (
                <div
                  key={c.key}
                  style={merge("font:600 11px 'Hanken Grotesk';padding:7px 13px;border-radius:7px;cursor:pointer", {
                    background: c.bg,
                    color: c.fg,
                    border: `1px solid ${c.bd}`,
                  })}
                  onClick={() => setCat(c.key)}
                >
                  {c.label}
                </div>
              ))}
            </div>

            {/* table */}
            <div style={css("padding:0 24px 24px")}>
              <div style={css(`font:500 9px 'Spline Sans Mono';letter-spacing:1px;color:#a89e8c;display:grid;${GRID};gap:12px;padding:0 12px 9px;border-bottom:1.5px solid #211d18`)}>
                <span style={{ cursor: "pointer" }} onClick={() => toggleSort("reg")}>VEHICLE {v.sortMarkReg}</span>
                <span>PCN NUMBER</span>
                <span style={{ cursor: "pointer" }} onClick={() => toggleSort("authority")}>AUTHORITY · DRIVER {v.sortMarkAuth}</span>
                <span>CATEGORY</span>
                <span style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>CONTRAVENTION {v.sortMarkDate}</span>
                <span style={{ textAlign: "right", cursor: "pointer" }} onClick={toggleDiscounted} title="Toggle full / discounted cost">
                  {v.costHead}
                </span>
              </div>

              {v.rows.map((r) => (
                <Hover
                  key={r.id}
                  base={merge(`display:grid;${GRID};gap:12px;align-items:center;padding:12px;border-bottom:1px solid #ece4d4;cursor:pointer;border-radius:7px`, {
                    background: r.hl,
                  })}
                  hover={{ background: "#faf6ec" }}
                  onClick={() => open(r.id)}
                >
                  <span style={css("font:600 12.5px 'Spline Sans Mono'")}>{r.reg}</span>
                  <span style={css("font:500 11.5px 'Spline Sans Mono';color:#6a6155")}>{r.pcn}</span>
                  <span style={css("overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 12.5px")}>
                    {r.authority} <span style={{ color: "#bcb3a0" }}>·</span>{" "}
                    <span style={css("color:#8a8175;font-weight:400")}>{r.driver}</span>
                  </span>
                  <span>
                    <span style={merge("font:600 9px 'Spline Sans Mono';letter-spacing:.5px;padding:3px 8px;border-radius:4px", { background: r.catBg, color: r.catFg })}>
                      {r.category}
                    </span>
                  </span>
                  <span style={css("font:500 11.5px 'Spline Sans Mono';color:#6a6155")}>{r.contravention}</span>
                  <span style={css("text-align:right;font:600 12.5px 'Spline Sans Mono'")}>{r.cost}</span>
                </Hover>
              ))}

              {v.empty && (
                <div style={css("text-align:center;padding:40px 0;color:#a89e8c;font:400 13px")}>
                  No letters match — clear the search or add a letter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ DETAIL (read-only stored record) ============ */}
        {v.showDetail && v.d && (
          <div style={css("padding:18px 24px 26px")}>
            <div style={css("display:flex;align-items:center;gap:14px;margin-bottom:18px")}>
              <div style={css("font:600 12px 'Spline Sans Mono';color:#8a8175;cursor:pointer")} onClick={goRegister}>← register</div>
              <div style={css("height:24px;width:1px;background:#e2dbcd")} />
              <div style={css("font:700 19px 'Spline Sans Mono';letter-spacing:.5px")}>{v.d.reg}</div>
              <span style={merge("font:600 9px 'Spline Sans Mono';letter-spacing:.6px;padding:3px 8px;border-radius:4px", { background: v.d.catBg, color: v.d.catFg })}>
                {v.d.category}
              </span>
            </div>

            <div style={css("display:grid;grid-template-columns:1.25fr 1fr;gap:24px;align-items:start")}>
              {/* stored fields */}
              <div style={css("background:#fffdf8;border:1px solid #e2dbcd;border-radius:11px;padding:20px 22px")}>
                <div style={css("font:600 14px 'Spectral',serif;margin-bottom:16px")}>Stored record</div>
                <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:16px 22px")}>
                  <Field label="PCN NUMBER" value={v.d.pcn} vstyle="font:600 14px 'Spline Sans Mono'" />
                  <Field label="ISSUING AUTHORITY" value={v.d.authority} vstyle="font:500 14px" />
                  <Field label="VEHICLE REG" value={v.d.reg} vstyle="font:600 14px 'Spline Sans Mono'" />
                  <Field label="DRIVER (name only)" value={v.d.driver} vstyle="font:500 14px" />
                  <Field label="DATE OF CONTRAVENTION" value={v.d.contravention} vstyle="font:500 14px 'Spline Sans Mono'" />
                  <Field label="DATE OF NOTICE" value={v.d.notice} vstyle="font:500 14px 'Spline Sans Mono'" />
                  <Field label="FULL COST" value={v.d.fullCost} vstyle="font:600 14px 'Spline Sans Mono'" />
                  <Field label="DISCOUNTED COST" value={v.d.discCost} vstyle="font:600 14px 'Spline Sans Mono'" />
                </div>
                {v.d.hasNotes && (
                  <div style={css("margin-top:18px;padding-top:16px;border-top:1px solid #ece4d4")}>
                    <div style={css("font:500 9px 'Spline Sans Mono';letter-spacing:.8px;color:#a89e8c;margin-bottom:6px")}>NOTES</div>
                    <div style={css("font:400 13px;line-height:1.5;color:#4a443c")}>{v.d.notes}</div>
                  </div>
                )}
                <div style={css("margin-top:18px;padding-top:14px;border-top:1px solid #ece4d4;font:500 10px 'Spline Sans Mono';color:#a89e8c")}>
                  Logged {v.d.loggedOn} · category {v.d.category} kept separate
                </div>
              </div>

              {/* letter image */}
              <div>
                <div style={css("font:500 9px 'Spline Sans Mono';letter-spacing:.8px;color:#a89e8c;margin-bottom:9px")}>LETTER ON FILE</div>
                {v.d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.d.image} alt="letter on file" style={css("width:100%;border-radius:11px;border:1px solid #e2dbcd;display:block")} />
                ) : (
                  <div style={css("width:100%;height:280px;border-radius:11px;border:1px dashed #d8cfbd;background:repeating-linear-gradient(45deg,#f6f1e6,#f6f1e6 9px,#f1ebdd 9px,#f1ebdd 18px);display:flex;align-items:center;justify-content:center;font:500 10px 'Spline Sans Mono';color:#b3a892;letter-spacing:1px")}>
                    no letter image
                  </div>
                )}
                <div style={css("font:400 10.5px;color:#a89e8c;margin-top:8px;line-height:1.5")}>
                  Held in private storage for audit. {v.d.fileName}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ CAPTURE ============ */}
        {v.showCapture && (
          <div style={css("padding:20px 24px 28px;min-height:460px")}>
            <div style={css("display:flex;align-items:center;gap:14px;margin-bottom:6px")}>
              <div style={css("font:600 12px 'Spline Sans Mono';color:#8a8175;cursor:pointer")} onClick={goRegister}>← register</div>
              <div style={css("height:22px;width:1px;background:#e2dbcd")} />
              <div style={css("font:600 19px 'Spectral',serif")}>Add a letter</div>
            </div>
            <div style={css("font:400 12px;color:#8a8175;margin-bottom:20px;max-width:560px")}>
              Take a photo of the letter or upload one — the details are read off automatically.{" "}
              <b>Nothing is saved until you check the fields and press Save.</b> No driver name is read from the image.
            </div>

            <div style={css("display:grid;grid-template-columns:340px 1fr;gap:24px;align-items:start")}>
              {/* capture pane */}
              <div>
                {v.cap.showDrop && (
                  <div style={css("display:flex;flex-direction:column;gap:12px")}>
                    <Hover
                      tag="label"
                      base={css("display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;height:188px;background:var(--accent,#9c3327);border-radius:13px;cursor:pointer;text-align:center;padding:18px;color:#fffdf8")}
                      hover={{ filter: "brightness(1.06)" }}
                    >
                      <div style={css("width:44px;height:44px;border:1.5px solid #f0d9cf;border-radius:9px;display:flex;align-items:center;justify-content:center;font:700 18px 'Spline Sans Mono';transform:rotate(-4deg)")}>▣</div>
                      <div style={css("font:700 14px 'Hanken Grotesk'")}>Take a photo</div>
                      <div style={css("font:400 10.5px;color:#f0d9cf")}>Use the camera to snap the letter</div>
                      <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
                    </Hover>
                    <Hover
                      tag="label"
                      base={css("display:flex;align-items:center;justify-content:center;gap:10px;height:64px;background:#fffdf8;border:1.5px dashed #d8cfbd;border-radius:13px;cursor:pointer;text-align:center;font:600 13px 'Hanken Grotesk';color:#6a6155")}
                      hover={{ borderColor: "var(--accent,#9c3327)" }}
                    >
                      <span style={css("font:700 15px 'Spline Sans Mono';color:var(--accent,#9c3327)")}>↑</span> Upload an image
                      <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
                    </Hover>
                    <div style={css("text-align:center;font:500 11px 'Hanken Grotesk';color:#a89e8c;padding-top:4px;cursor:pointer")} onClick={capManual}>
                      or enter the details manually
                    </div>
                  </div>
                )}
                {v.cap.showProcessing && (
                  <div style={css("display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;height:280px;background:#1b1714;border-radius:13px;color:#efe9dd")}>
                    <span style={css("width:30px;height:30px;border:3px solid #4a3f37;border-top-color:#c9a98a;border-radius:50%;animation:rdspin .8s linear infinite")} />
                    <div style={css("font:600 13px 'Hanken Grotesk'")}>Reading the letter…</div>
                    <div style={css("font:500 10px 'Spline Sans Mono';color:#9a8d80")}>{v.cap.fileName}</div>
                    <div style={css("font:400 10px;color:#7a6f63;max-width:220px;text-align:center")}>
                      Pulling out PCN number, dates, reg, authority and costs
                    </div>
                  </div>
                )}
                {v.cap.showThumb && (
                  <div>
                    {v.cap.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.cap.image} alt="captured letter" style={css("width:100%;border-radius:13px;border:1px solid #e2dbcd;display:block")} />
                    ) : (
                      <div style={css("height:220px;border-radius:13px;border:1px dashed #d8cfbd;background:repeating-linear-gradient(45deg,#f6f1e6,#f6f1e6 9px,#f1ebdd 9px,#f1ebdd 18px);display:flex;align-items:center;justify-content:center;font:500 10px 'Spline Sans Mono';color:#b3a892")}>
                        manual entry — no image
                      </div>
                    )}
                    <div style={css("font:400 10.5px;color:#a89e8c;margin-top:8px")}>{v.cap.fileName}</div>
                  </div>
                )}
              </div>

              {/* confirm draft / hint */}
              {v.cap.showDraft ? (
                <div style={css("background:#fffdf8;border:1px solid #e2dbcd;border-radius:13px;padding:20px 22px")}>
                  <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:16px")}>
                    <div style={css("font:600 15px 'Spectral',serif")}>Check &amp; save</div>
                    <span style={merge("font:500 9px 'Spline Sans Mono';letter-spacing:.6px;padding:4px 9px;border-radius:5px", { background: v.cap.dedupeBg, color: v.cap.dedupeFg })}>
                      {v.cap.dedupe}
                    </span>
                  </div>
                  <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:13px 16px")}>
                    <div>
                      <div style={css(LABEL)}>PCN NUMBER</div>
                      <input value={v.cap.draft.pcn} onChange={capField("pcn")} style={css(INPUT_MONO)} />
                    </div>
                    <div>
                      <div style={css(LABEL)}>VEHICLE REG</div>
                      <input value={v.cap.draft.reg} onChange={capField("reg")} style={css(INPUT_MONO)} />
                    </div>
                    <div>
                      <div style={css(LABEL)}>ISSUING AUTHORITY</div>
                      <input value={v.cap.draft.authority} onChange={capField("authority")} style={css(INPUT_HANKEN)} />
                    </div>
                    <div>
                      <div style={css(LABEL)}>CATEGORY</div>
                      <div style={css("display:flex;gap:6px")}>
                        <div style={merge("flex:1;text-align:center;font:600 11px 'Hanken Grotesk';padding:8px;border-radius:7px;cursor:pointer;border:1px solid #e2dbcd", { background: v.cap.councilBg, color: v.cap.councilFg })} onClick={() => setCapCat("council")}>council</div>
                        <div style={merge("flex:1;text-align:center;font:600 11px 'Hanken Grotesk';padding:8px;border-radius:7px;cursor:pointer;border:1px solid #e2dbcd", { background: v.cap.privateBg, color: v.cap.privateFg })} onClick={() => setCapCat("private")}>private</div>
                      </div>
                    </div>
                    <div>
                      <div style={css(LABEL)}>DATE OF CONTRAVENTION</div>
                      <input value={v.cap.draft.doc} onChange={capField("doc")} placeholder="2026-06-19" style={css(INPUT_MONO)} />
                    </div>
                    <div>
                      <div style={css(LABEL)}>DATE OF NOTICE</div>
                      <input value={v.cap.draft.don} onChange={capField("don")} placeholder="2026-06-24" style={css(INPUT_MONO)} />
                    </div>
                    <div>
                      <div style={css(LABEL)}>FULL COST</div>
                      <input value={v.cap.draft.full} onChange={capField("full")} placeholder="£130.00" style={css(INPUT_MONO)} />
                    </div>
                    <div>
                      <div style={css(LABEL)}>DISCOUNTED COST</div>
                      <input value={v.cap.draft.disc} onChange={capField("disc")} placeholder="£65.00" style={css(INPUT_MONO)} />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <div style={css(LABEL)}>DRIVER · NAME ONLY (optional)</div>
                      <input value={v.cap.draft.driver} onChange={capField("driver")} placeholder="Add later from the register" style={css(INPUT_HANKEN)} />
                    </div>
                  </div>

                  <div style={css("display:flex;align-items:center;gap:12px;margin-top:18px")}>
                    <div style={css("font:700 12px 'Spline Sans Mono';letter-spacing:.6px;padding:12px 18px;border-radius:8px;cursor:pointer;background:var(--accent,#9c3327);color:#fffdf8;transform:rotate(-1deg);box-shadow:0 3px 0 rgba(120,40,30,.35)")} onClick={capSave}>
                      SAVE TO REGISTER
                    </div>
                    <div style={css("font:600 12px 'Hanken Grotesk';color:#8a8175;cursor:pointer")} onClick={capReset}>Discard</div>
                  </div>
                </div>
              ) : (
                <div style={css("display:flex;flex-direction:column;justify-content:center;height:280px;color:#a89e8c;font:400 12.5px;line-height:1.6;max-width:340px")}>
                  <div style={css("font:600 13px 'Spectral',serif;color:#6a6155;margin-bottom:8px")}>How it works</div>
                  Snap or upload the letter and the fields fill themselves in. You review and correct anything before saving — what you save is what gets stored. The register checks the PCN number so you don&apos;t log the same letter twice.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
