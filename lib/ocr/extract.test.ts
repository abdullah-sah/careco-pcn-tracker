import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        parse: async () => ({
          parsed_output: {
            category: "council", pcnNumber: "AB12", authority: "Brent", vehicleReg: "AB12CDE",
            dateOfPcn: "2026-06-19", discountPeriodDays: 14, fullCost: 130, discountedCost: 65, cost: null,
          },
        }),
      };
    },
  };
});

import { extractPcn } from "./extract";

describe("extractPcn", () => {
  it("returns the parsed structured fields", async () => {
    const r = await extractPcn("ZmFrZQ==", "image/jpeg");
    expect(r.pcnNumber).toBe("AB12");
    expect(r.fullCost).toBe(130);
    expect(r.category).toBe("council");
  });
});
