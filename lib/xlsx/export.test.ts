import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { TEMPLATE_B64 } from "./template-data";
import { parseWorkbook } from "./import";
import { buildXlsx } from "./export";

const template = Buffer.from(TEMPLATE_B64, "base64");
const rows = parseWorkbook(template);
const out = buildXlsx(template, rows);

const A = unzipSync(template);
const B = unzipSync(out);
const dec = (u: Uint8Array) => new TextDecoder().decode(u);

describe("buildXlsx fidelity (same data in)", () => {
  it("changes only the two sheet XMLs and workbook.xml", () => {
    const changed = Object.keys(A)
      .filter((k) => dec(A[k]) !== dec(B[k]))
      .sort();
    expect(changed).toEqual([
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
  });
  it("preserves the metadata sheet and styles byte-for-byte", () => {
    expect(dec(B["xl/worksheets/sheet3.xml"])).toBe(dec(A["xl/worksheets/sheet3.xml"]));
    expect(dec(B["xl/styles.xml"])).toBe(dec(A["xl/styles.xml"]));
  });
  it("round-trips every value (export → re-import equals original rows)", () => {
    const back = parseWorkbook(out);
    const norm = (r: any) => ({ ...r, sortSeq: 0 });
    expect(back.map(norm)).toEqual(rows.map(norm));
  });
  it("currency cells keep style 3 and date cells style 4", () => {
    const s2 = dec(B["xl/worksheets/sheet2.xml"]);
    expect(s2).toMatch(/<c r="D2" s="3"><v>/);
    expect(s2).toMatch(/<c r="F2" s="4"><v>/);
  });
  it("escapes ampersands in inline strings", () => {
    const seq = Math.max(...rows.map((r) => r.sortSeq)) + 1;
    const withAmp = buildXlsx(template, [
      ...rows,
      { ...rows.find((r) => r.category === "council")!, sortSeq: seq, authority: "Hammersmith & Fulham" },
    ]);
    const s2 = dec(unzipSync(withAmp)["xl/worksheets/sheet2.xml"]);
    expect(s2).toContain("Hammersmith &amp; Fulham");
  });
});

describe("buildXlsx range bumping (added rows)", () => {
  it("extends Council dimension + filter to the new last row", () => {
    const councilRows = rows.filter((r) => r.category === "council");
    const seq = Math.max(...rows.map((r) => r.sortSeq)) + 1;
    const out2 = buildXlsx(template, [
      ...rows,
      { ...councilRows[0], sortSeq: seq, pcnNumber: "NEWPCN001" },
    ]);
    const last = councilRows.length + 2; // +1 header, +1 new row
    const wb = dec(unzipSync(out2)["xl/workbook.xml"]);
    const s2 = dec(unzipSync(out2)["xl/worksheets/sheet2.xml"]);
    expect(wb).toContain(`Council!$A$1:$M$${last}`);
    expect(s2).toContain(`<dimension ref="A1:M${last}"/>`);
  });
});
