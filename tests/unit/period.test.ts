import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/lib/period";

describe("reporting periods", () => {
  const today = "2026-10-15";
  it("defaults to month to date", () => expect(resolvePeriod(today, {})).toEqual({ from: "2026-10-01", to: today, preset: "this_month" }));
  it("last month is a whole month", () => expect(resolvePeriod(today, { preset: "last_month" })).toMatchObject({ from: "2026-09-01", to: "2026-09-30" }));
  it("handles January rollover", () => {
    expect(resolvePeriod("2026-01-10", { preset: "last_month" })).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("2026-02-10", { preset: "last_3_months" })).toMatchObject({ from: "2025-12-01" });
  });
  it("last 12 months starts on the first of the month 11 months back", () => expect(resolvePeriod(today, { preset: "last_12_months" })).toMatchObject({ from: "2025-11-01", to: today }));
  it("rejects an inverted custom range", () => expect(resolvePeriod(today, { preset: "custom", from: "2026-05-01", to: "2026-04-01" }).preset).toBe("this_month"));
  it("accepts a valid custom range", () => expect(resolvePeriod(today, { preset: "custom", from: "2026-04-01", to: "2026-05-01" })).toMatchObject({ from: "2026-04-01", to: "2026-05-01" }));
  it("leap-year February", () => expect(resolvePeriod("2028-03-05", { preset: "last_month" })).toMatchObject({ to: "2028-02-29" }));
});
