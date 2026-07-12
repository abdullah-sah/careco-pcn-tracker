import { describe, expect, it } from "vitest";
import { canSendToAli } from "./status";

describe("canSendToAli", () => {
  it("allows new council tickets", () => {
    expect(canSendToAli("council", "Not started")).toBe(true);
  });

  it("allows council tickets with new correspondence", () => {
    expect(canSendToAli("council", "New correspondence (send to Ali)")).toBe(true);
  });

  it("never allows private tickets", () => {
    expect(canSendToAli("private", "Not started")).toBe(false);
    expect(canSendToAli("private", "New correspondence (send to Ali)")).toBe(false);
  });

  it("rejects other statuses and unset status", () => {
    expect(canSendToAli("council", "In progress (Ali)")).toBe(false);
    expect(canSendToAli("council", "Complete")).toBe(false);
    expect(canSendToAli("council", null)).toBe(false);
  });
});
