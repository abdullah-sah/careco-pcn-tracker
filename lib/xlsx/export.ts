import { unzipSync, zipSync } from "fflate";
import type { PcnRow } from "../pcn/types";
import { PRIVATE_COLS, COUNCIL_COLS, STYLE, type ColSpec } from "../pcn/columns";
import { penceToPounds, dateToSerial } from "../convert";

const enc = new TextEncoder();
const dec = new TextDecoder();

function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineStr(ref: string, value: string): string {
  const preserve = value !== value.trim() ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
}

function cellXml(ref: string, spec: ColSpec, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (spec.kind) {
    case "currency":
      return `<c r="${ref}" s="${STYLE.currency}"><v>${penceToPounds(value as number)}</v></c>`;
    case "date":
      return `<c r="${ref}" s="${STYLE.date}"><v>${dateToSerial(value as string)}</v></c>`;
    case "number":
      return `<c r="${ref}"><v>${value as number}</v></c>`;
    case "paidish": {
      const sv = String(value);
      return /^-?\d+(\.\d+)?$/.test(sv) ? `<c r="${ref}"><v>${sv}</v></c>` : inlineStr(ref, sv);
    }
    default:
      return inlineStr(ref, String(value));
  }
}

function headerRow1(sheetXml: string): string {
  const m = sheetXml.match(/<row r="1"[\s\S]*?<\/row>/);
  if (!m) throw new Error("template sheet missing header row 1");
  return m[0];
}

function buildSheetData(sheetXml: string, rows: PcnRow[], cols: ColSpec[]): string {
  const ordered = [...rows].sort((a, b) => a.sortSeq - b.sortSeq);
  let body = headerRow1(sheetXml);
  ordered.forEach((row, i) => {
    const r = i + 2; // data starts at row 2 (row 1 = header, copied from template)
    const cells = cols
      .map((spec, idx) => cellXml(`${colLetter(idx + 1)}${r}`, spec, (row as any)[spec.field]))
      .join("");
    body += `<row r="${r}" spans="1:${cols.length}">${cells}</row>`;
  });
  return `<sheetData>${body}</sheetData>`;
}

function replaceSheetData(sheetXml: string, newSheetData: string): string {
  if (/<sheetData\/>/.test(sheetXml)) return sheetXml.replace(/<sheetData\/>/, newSheetData);
  return sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, newSheetData);
}

// Set the data-table bounds (dimension + autoFilter) to the exact last data row.
//
// Only these two ranges (plus workbook.xml's _xlnm._FilterDatabase, handled in
// bumpDefinedName) track the row count. The template's conditionalFormatting and
// (x14) dataValidation ranges are intentionally left byte-for-byte:
//   - several are full-column ranges ending at 1048576 (e.g. I1:K1048576, L1:L1048576),
//   - one starts BELOW the data (I74:K1048576), as does the dropdown dataValidation
//     (<xm:sqref>J74:K1048576</xm:sqref>),
//   - column M is only partially covered by hand-crafted cell ranges.
// Rewriting their end-row to the last data row would shrink the full-column ranges,
// reverse the below-data range (I74:K73), and over-apply the partial column-M formatting,
// changing the workbook's appearance. Preserving them keeps the export visually identical.
function setSheetBounds(sheetXml: string, lastCol: string, last: number): string {
  let xml = sheetXml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastCol}${last}"/>`);
  xml = xml.replace(/<autoFilter ref="[^"]*"/, `<autoFilter ref="A1:${lastCol}${last}"`);
  return xml;
}

// workbook.xml: Council!$A$1:$M$17 → Council!$A$1:$M$<last>
function bumpDefinedName(workbookXml: string, sheet: string, last: number): string {
  const re = new RegExp(`(${sheet}!\\$[A-Z]+\\$1:\\$[A-Z]+\\$)\\d+`);
  return workbookXml.replace(re, `$1${last}`);
}

export function buildXlsx(template: Uint8Array, rows: PcnRow[]): Uint8Array {
  const files = unzipSync(template);
  const sheets: Array<{ path: string; cols: ColSpec[]; cat: PcnRow["category"]; lastCol: string }> = [
    { path: "xl/worksheets/sheet1.xml", cols: PRIVATE_COLS, cat: "private", lastCol: "I" },
    { path: "xl/worksheets/sheet2.xml", cols: COUNCIL_COLS, cat: "council", lastCol: "M" },
  ];

  for (const s of sheets) {
    const xml = dec.decode(files[s.path]);
    const catRows = rows.filter((r) => r.category === s.cat);
    const last = catRows.length + 1; // +1 header row
    let next = replaceSheetData(xml, buildSheetData(xml, catRows, s.cols));
    next = setSheetBounds(next, s.lastCol, last);
    files[s.path] = enc.encode(next);
  }

  const councilLast = rows.filter((r) => r.category === "council").length + 1;
  files["xl/workbook.xml"] = enc.encode(
    bumpDefinedName(dec.decode(files["xl/workbook.xml"]), "Council", councilLast),
  );

  return zipSync(files);
}
