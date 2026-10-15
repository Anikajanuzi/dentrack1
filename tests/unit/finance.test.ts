import { describe, expect, it } from "vitest";
import {
  caseFinancials, costBreakdown, formatMoney, lineTotal, outstandingBalance, pct, sectionState, sum,
} from "@/lib/finance";

const base = {
  material_total: "16.50", labor_total: "20.00", other_total: "8.00",
  material_entries: 1, labor_entries: 2, other_entries: 1, estimate_entries: 0,
  materials_confirmed: true, labor_confirmed: true, other_costs_confirmed: true,
};

describe("cost lines", () => {
  it("multiplies quantity × unit cost with decimal precision", () => {
    expect(lineTotal("0.5", "33.00")).toBe("16.50");
    expect(lineTotal(1.5, 8)).toBe("12.00");
    expect(lineTotal("0.1", "0.2")).toBe("0.02"); // float would give 0.020000000000000004
    expect(lineTotal("3", "0.333")).toBe("1.00"); // half-up
  });
  it("sums without float drift", () => {
    expect(sum(["0.1", "0.2"])).toBe("0.30");
    expect(sum(["12.00", "8.00"])).toBe("20.00");
  });
});

describe("cost breakdown (specification example)", () => {
  const b = costBreakdown(base);
  it("totals 44.50", () => expect(b.total).toBe("44.50"));
  it("matches the documented percentages", () => {
    expect(b.shares).toEqual({ materials: "37.1", labor: "44.9", other: "18.0" });
  });
  it("is complete when all sections are confirmed", () => expect(b.complete).toBe(true));
});

describe("missing data is not zero", () => {
  it("distinguishes missing, incomplete, confirmed and confirmed-zero", () => {
    expect(sectionState(0, false)).toBe("missing");
    expect(sectionState(2, false)).toBe("incomplete");
    expect(sectionState(2, true)).toBe("confirmed");
    expect(sectionState(0, true)).toBe("confirmed_zero");
  });
  it("marks breakdown incomplete when a section is unrecorded", () => {
    const b = costBreakdown({ ...base, other_total: "0", other_entries: 0, other_costs_confirmed: false });
    expect(b.complete).toBe(false);
    expect(b.openSections).toEqual(["other"]);
  });
  it("estimates keep the breakdown incomplete", () => {
    expect(costBreakdown({ ...base, estimate_entries: 1 }).complete).toBe(false);
  });
  it("returns null shares when there are no costs", () => {
    const b = costBreakdown({ ...base, material_total: 0, labor_total: 0, other_total: 0 });
    expect(b.shares.materials).toBeNull();
  });
});

describe("case financial summary", () => {
  const costs = costBreakdown(base);
  it("computes net price, gross profit and margin", () => {
    const f = caseFinancials({ selling_price: "120.00", discount_amount: "10.00", costs, billing: [] });
    expect(f.netSellingPrice).toBe("110.00");
    expect(f.profit).toBe("65.50");
    expect(f.marginPct).toBe("59.5");
    expect(f.profitLabel).toBe("Gross profit");
  });
  it("uses the contribution label when costs are incomplete", () => {
    const f = caseFinancials({
      selling_price: "120", discount_amount: 0, billing: [],
      costs: costBreakdown({ ...base, labor_confirmed: false }),
    });
    expect(f.profitLabel).toBe("Contribution after recorded costs");
    expect(f.profitIsComplete).toBe(false);
  });
  it("handles a missing price and zero net price without dividing by zero", () => {
    expect(caseFinancials({ selling_price: null, discount_amount: 0, costs, billing: [] }).marginPct).toBeNull();
    const zero = caseFinancials({ selling_price: "10", discount_amount: "10", costs, billing: [] });
    expect(zero.netSellingPrice).toBe("0.00");
    expect(zero.marginPct).toBeNull();
  });
  it("tracks partial payments and credits on a single-case invoice", () => {
    const f = caseFinancials({
      selling_price: "120", discount_amount: "10", costs,
      billing: [{ invoice_id: "i", number: "INV-1", status: "partially_paid", line_amount: "110.00", invoice_total: "110.00",
        invoice_paid: "50.00", invoice_credited: "10.00", invoice_outstanding: "50.00", lines_on_invoice: 1 }],
    });
    expect(f.amountBilled).toBe("110.00");
    expect(f.paymentsReceived).toBe("50.00");
    expect(f.outstanding).toBe("50.00");
    expect(f.proRata).toBe(false);
  });
  it("attributes multi-case invoices pro-rata and says so", () => {
    const f = caseFinancials({
      selling_price: "100", discount_amount: 0, costs,
      billing: [{ invoice_id: "i", number: "INV-2", status: "partially_paid", line_amount: "100.00", invoice_total: "400.00",
        invoice_paid: "200.00", invoice_credited: "0", invoice_outstanding: "200.00", lines_on_invoice: 3 }],
    });
    expect(f.paymentsReceived).toBe("50.00");
    expect(f.outstanding).toBe("50.00");
    expect(f.proRata).toBe(true);
  });
});

describe("helpers", () => {
  it("outstanding balance", () => expect(outstandingBalance("110", "50", "10")).toBe("50.00"));
  it("percentage of zero total is undefined", () => expect(pct(5, 0)).toBeNull());
  it("formats money and missing values", () => {
    expect(formatMoney("44.5", "EUR")).toBe("€44.50");
    expect(formatMoney(null)).toBe("—");
  });
});
