import { describe, expect, it } from "vitest";
import { QUEUE_GROUP_ORDER, queueEntryFor, type QueuePcn } from "./queue";

const NOW = new Date(2026, 6, 12); // 12 Jul 2026 (local)

function pcn(over: Partial<QueuePcn> = {}): QueuePcn {
  return {
    category: "council", status: null, authority: "", driverName: null,
    costPence: null, discountedCostPence: null,
    aliPaid: null, aliFeePence: null, aliPaidAt: null,
    moneyRequested: null, moneyRequestedAt: null,
    driverPaid: null, driverPaidPence: null, driverPaidAt: null,
    appealWonAt: null,
    ...over,
  };
}

// Fully-finished council money loop.
const loopDone = { aliFeePence: 3000, moneyRequested: "Yes", driverPaid: "Yes" } as const;

describe("QUEUE_GROUP_ORDER", () => {
  it("fixes the group display order", () => {
    expect(QUEUE_GROUP_ORDER).toEqual(["SEND TO ALI", "CONTACT OPERATOR", "MONEY", "DECIDE NEXT STEP"]);
  });
});

describe("status actions", () => {
  it("council Not started → dispatch under SEND TO ALI", () => {
    const e = queueEntryFor(pcn({ status: "Not started", authority: "Brent" }), NOW);
    expect(e.bucket).toBe("todo");
    expect(e.action).toEqual({
      key: "dispatch", group: "SEND TO ALI", label: "Send to Ali + pay / start appeal",
    });
  });

  it("TfL tickets get the appeal-only label", () => {
    for (const authority of ["TfL", "tfl", "Transport for London", "TfL (Red Route)"]) {
      const e = queueEntryFor(pcn({ status: "Not started", authority }), NOW);
      expect(e.action?.label).toBe("Start appeal (TfL)");
      expect(e.action?.key).toBe("dispatch");
    }
  });

  it("council New correspondence → send_to_ali", () => {
    const e = queueEntryFor(pcn({ status: "New correspondence (send to Ali)" }), NOW);
    expect(e.bucket).toBe("todo");
    expect(e.action).toEqual({
      key: "send_to_ali", group: "SEND TO ALI", label: "Send new correspondence to Ali",
    });
  });

  it("council Appeal rejected → decide_next", () => {
    const e = queueEntryFor(pcn({ status: "Appeal rejected" }), NOW);
    expect(e.bucket).toBe("todo");
    expect(e.action).toEqual({
      key: "decide_next", group: "DECIDE NEXT STEP",
      label: "Rejected — resend to Ali, follow up, or pay off",
    });
  });

  it("private Not started → contact_operator", () => {
    const e = queueEntryFor(pcn({ category: "private", status: "Not started" }), NOW);
    expect(e.bucket).toBe("todo");
    expect(e.action).toEqual({ key: "contact_operator", group: "CONTACT OPERATOR", label: "Contact operator" });
  });

  it("status action wins over any pending money step", () => {
    const e = queueEntryFor(pcn({ status: "Not started", moneyRequested: "Yes" }), NOW);
    expect(e.action?.key).toBe("dispatch");
  });
});

describe("money actions (council loop)", () => {
  for (const status of ["In progress (Ali)", "Complete"] as const) {
    it(`${status}: first incomplete step wins`, () => {
      // No fee yet → pay_ali (even if later steps also incomplete).
      expect(queueEntryFor(pcn({ status }), NOW).action).toEqual({
        key: "pay_ali", group: "MONEY", label: "Pay Ali £30/£40",
      });
      // Fee known (structured or legacy text) → request £80.
      expect(queueEntryFor(pcn({ status, aliFeePence: 4000 }), NOW).action?.key).toBe("request_money");
      expect(queueEntryFor(pcn({ status, aliPaid: "30" }), NOW).action).toEqual({
        key: "request_money", group: "MONEY", label: "Request £80 from driver",
      });
      // Requested but unpaid → chase.
      expect(queueEntryFor(pcn({ status, aliFeePence: 3000, moneyRequested: "Yes" }), NOW).action?.key)
        .toBe("chase_driver");
    });
  }

  it("chase label names the driver and the request age", () => {
    const e = queueEntryFor(
      pcn({ status: "In progress (Ali)", aliFeePence: 3000, driverName: "Amir", moneyRequestedAt: "2026-07-01" }),
      NOW,
    );
    expect(e.action?.label).toBe("Chase Amir for £80 — requested 11d ago");
  });

  it("chase label handles missing driver and undated request", () => {
    const e = queueEntryFor(
      pcn({ status: "Complete", aliFeePence: 3000, driverName: "  ", moneyRequested: "Yes" }),
      NOW,
    );
    expect(e.action?.label).toBe("Chase unassigned for £80");
  });

  it("loop finished: In progress (Ali) waits with Ali, Complete is done", () => {
    const inProgress = queueEntryFor(pcn({ status: "In progress (Ali)", ...loopDone }), NOW);
    expect(inProgress).toEqual({ bucket: "waiting", action: null, waitingOn: "with Ali" });
    const complete = queueEntryFor(pcn({ status: "Complete", ...loopDone }), NOW);
    expect(complete).toEqual({ bucket: "done", action: null, waitingOn: null });
  });

  it("Appeal won waives the loop entirely — done, never a money action", () => {
    const e = queueEntryFor(pcn({ status: "Appeal won", moneyRequested: "Yes" }), NOW);
    expect(e).toEqual({ bucket: "done", action: null, waitingOn: null });
  });

  it("private tickets never get money actions", () => {
    const e = queueEntryFor(pcn({ category: "private", status: "Message sent", moneyRequested: "Yes" }), NOW);
    expect(e.action).toBe(null);
  });
});

describe("legacy statuses (null / blank / free text)", () => {
  for (const status of [null, "", "chasing council", "  "]) {
    it(`${JSON.stringify(status)}: only chases a requested-and-unpaid debt`, () => {
      const debt = queueEntryFor(pcn({ status, driverName: "Bea", moneyRequested: "Yes" }), NOW);
      expect(debt.bucket).toBe("todo");
      expect(debt.action?.key).toBe("chase_driver");
      expect(debt.action?.label).toBe("Chase Bea for £80");
    });

    it(`${JSON.stringify(status)}: never prompts pay_ali/request_money; no debt → waiting`, () => {
      // Fee unknown but no request outstanding: nothing knowable to do.
      const idle = queueEntryFor(pcn({ status }), NOW);
      expect(idle).toEqual({ bucket: "waiting", action: null, waitingOn: null });
      // Debt already recovered: nothing to chase.
      const paid = queueEntryFor(pcn({ status, moneyRequested: "Yes", driverPaid: "Yes" }), NOW);
      expect(paid.action).toBe(null);
      expect(paid.bucket).toBe("waiting");
    });
  }
});

describe("buckets for the remaining statuses", () => {
  it("waiting rows say whose court the ball is in", () => {
    expect(queueEntryFor(pcn({ status: "In progress (reassign)" }), NOW))
      .toEqual({ bucket: "waiting", action: null, waitingOn: "appeal with council" });
    expect(queueEntryFor(pcn({ category: "private", status: "Message sent" }), NOW))
      .toEqual({ bucket: "waiting", action: null, waitingOn: "with operator" });
  });

  it("closed private statuses are done", () => {
    expect(queueEntryFor(pcn({ category: "private", status: "Paid" }), NOW).bucket).toBe("done");
    expect(queueEntryFor(pcn({ category: "private", status: "Canceled" }), NOW).bucket).toBe("done");
  });
});
