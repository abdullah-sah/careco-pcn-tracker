import { describe, it, expect } from "vitest";
import { poundsToPence, penceToPounds, dateToSerial, serialToDate } from "./convert";

describe("money", () => {
  it("pounds → pence rounds to integer", () => {
    expect(poundsToPence(160)).toBe(16000);
    expect(poundsToPence(65.5)).toBe(6550);
  });
  it("pence → pounds", () => {
    expect(penceToPounds(16000)).toBe(160);
    expect(penceToPounds(6550)).toBe(65.5);
  });
});

describe("excel serial dates (epoch 1899-12-30)", () => {
  it("1900-01-01 is serial 2", () => {
    expect(dateToSerial("1900-01-01")).toBe(2);
  });
  it("round-trips a real value", () => {
    expect(serialToDate(dateToSerial("2026-06-19"))).toBe("2026-06-19");
  });
  it("serialToDate is inverse of dateToSerial", () => {
    expect(dateToSerial(serialToDate(46140))).toBe(46140);
  });
});
