import { describe, expect, it } from "vitest";
import { canSendToAli, statusesFor, COUNCIL_STATUSES, PRIVATE_STATUSES } from "./status";

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

describe("statusesFor", () => {
  it("gives councils the council lifecycle including Appeal won", () => {
    expect(statusesFor("council")).toBe(COUNCIL_STATUSES);
    expect(COUNCIL_STATUSES).toContain("Appeal won");
  });

  it("gives private tickets their own lifecycle", () => {
    expect(statusesFor("private")).toBe(PRIVATE_STATUSES);
    expect(PRIVATE_STATUSES).toEqual(["Not started", "Message sent", "Paid", "Canceled"]);
  });
});
