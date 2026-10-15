/**
 * DENTRACK financial calculations.
 *
 * All arithmetic uses decimal.js — never binary floating point.
 * Monetary amounts move through the app as strings (PostgreSQL NUMERIC) and are only
 * converted to numbers for chart rendering.
 *
 * Rounding policy: amounts are rounded half-up to 2 decimals; percentages to 1 decimal.
 */
import Decimal from "decimal.js";
import { sqMoney } from "./i18n/config";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Money = string; // NUMERIC as string, e.g. "44.50"
export type Amount = Money | number | null | undefined;

export const D = (v: Amount): Decimal => new Decimal(v === null || v === undefined || v === "" ? 0 : v);
export const isMissing = (v: Amount) => v === null || v === undefined || v === "";
export const money = (v: Decimal): Money => v.toDecimalPlaces(2).toFixed(2);

export function lineTotal(quantity: Amount, unitCost: Amount): Money {
  return money(D(quantity).times(D(unitCost)));
}

export function sum(values: Amount[]): Money {
  return money(values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0)));
}

/** Percentage of part in total, 1 decimal. null when the total is zero (undefined share). */
export function pct(part: Amount, total: Amount): string | null {
  const t = D(total);
  if (t.isZero()) return null;
  return D(part).dividedBy(t).times(100).toDecimalPlaces(1).toFixed(1);
}

// ─────────────────────────────────────────────────────────────
// Cost sections & completeness
// ─────────────────────────────────────────────────────────────
export type SectionState = "missing" | "incomplete" | "confirmed" | "confirmed_zero";

/** No entries and not confirmed = missing data. Confirmed with no entries = a genuine zero. */
export function sectionState(entryCount: number, confirmed: boolean): SectionState {
  if (confirmed) return entryCount === 0 ? "confirmed_zero" : "confirmed";
  return entryCount === 0 ? "missing" : "incomplete";
}

export const SECTION_STATE_LABEL: Record<SectionState, string> = {
  missing: "Not recorded",
  incomplete: "In progress",
  confirmed: "Confirmed",
  confirmed_zero: "Confirmed: no costs",
};

export interface CostSummaryInput {
  material_total: Amount;
  labor_total: Amount;
  other_total: Amount;
  material_entries: number;
  labor_entries: number;
  other_entries: number;
  estimate_entries: number;
  materials_confirmed: boolean;
  labor_confirmed: boolean;
  other_costs_confirmed: boolean;
}

export interface CostBreakdown {
  materials: Money;
  labor: Money;
  other: Money;
  total: Money;
  shares: { materials: string | null; labor: string | null; other: string | null };
  states: { materials: SectionState; labor: SectionState; other: SectionState };
  hasEstimates: boolean;
  /** Every section explicitly confirmed and no estimate entries remain. */
  complete: boolean;
  /** Sections that are not yet confirmed (for disclosure text). */
  openSections: Array<"materials" | "labor" | "other">;
}

export function costBreakdown(s: CostSummaryInput): CostBreakdown {
  const materials = money(D(s.material_total));
  const labor = money(D(s.labor_total));
  const other = money(D(s.other_total));
  const total = sum([materials, labor, other]);
  const states = {
    materials: sectionState(s.material_entries, s.materials_confirmed),
    labor: sectionState(s.labor_entries, s.labor_confirmed),
    other: sectionState(s.other_entries, s.other_costs_confirmed),
  };
  const openSections = (Object.keys(states) as Array<keyof typeof states>).filter(
    (k) => states[k] === "missing" || states[k] === "incomplete",
  );
  const hasEstimates = s.estimate_entries > 0;
  return {
    materials,
    labor,
    other,
    total,
    shares: { materials: pct(materials, total), labor: pct(labor, total), other: pct(other, total) },
    states,
    hasEstimates,
    complete: openSections.length === 0 && !hasEstimates,
    openSections,
  };
}

// ─────────────────────────────────────────────────────────────
// Per-case financial summary
// ─────────────────────────────────────────────────────────────
export interface CaseBillingLine {
  invoice_id: string;
  number: string;
  status: string; // invoice payment status
  line_amount: Amount;
  invoice_total: Amount;
  invoice_paid: Amount;
  invoice_credited: Amount;
  invoice_outstanding: Amount;
  lines_on_invoice: number;
}

export interface CaseFinancialInput {
  selling_price: Amount; // null = no price set (missing)
  discount_amount: Amount;
  costs: CostBreakdown;
  billing: CaseBillingLine[];
}

export interface CaseFinancialSummary {
  sellingPrice: Money | null;
  discount: Money;
  netSellingPrice: Money | null;
  totalDirectCost: Money;
  profit: Money | null;
  marginPct: string | null;
  /** "Gross profit" only when costs are complete; otherwise a contribution figure. */
  profitLabel: "Gross profit" | "Contribution after recorded costs";
  profitIsComplete: boolean;
  amountBilled: Money;
  paymentsReceived: Money;
  creditsApplied: Money;
  outstanding: Money;
  /** True when any invoice holds several cases, so payment figures are a pro-rata share. */
  proRata: boolean;
}

export function caseFinancials(input: CaseFinancialInput): CaseFinancialSummary {
  const priceMissing = isMissing(input.selling_price);
  const discount = money(D(input.discount_amount));
  const net = priceMissing ? null : money(D(input.selling_price).minus(D(discount)));
  const profit = net === null ? null : money(D(net).minus(D(input.costs.total)));
  const marginPct = net === null || profit === null ? null : pct(profit, net);

  let billed = new Decimal(0);
  let paid = new Decimal(0);
  let credited = new Decimal(0);
  let outstanding = new Decimal(0);
  let proRata = false;
  for (const b of input.billing) {
    const lineAmt = D(b.line_amount);
    billed = billed.plus(lineAmt);
    const total = D(b.invoice_total);
    if (total.isZero()) continue;
    const share = b.lines_on_invoice > 1 ? lineAmt.dividedBy(total) : new Decimal(1);
    if (b.lines_on_invoice > 1) proRata = true;
    paid = paid.plus(D(b.invoice_paid).times(share));
    credited = credited.plus(D(b.invoice_credited).times(share));
    outstanding = outstanding.plus(D(b.invoice_outstanding).times(share));
  }

  return {
    sellingPrice: priceMissing ? null : money(D(input.selling_price)),
    discount,
    netSellingPrice: net,
    totalDirectCost: input.costs.total,
    profit,
    marginPct,
    profitLabel: input.costs.complete ? "Gross profit" : "Contribution after recorded costs",
    profitIsComplete: input.costs.complete,
    amountBilled: money(billed),
    paymentsReceived: money(paid),
    creditsApplied: money(credited),
    outstanding: money(outstanding),
    proRata,
  };
}

/** Outstanding balance = invoice total − payments − applied credits. */
export function outstandingBalance(total: Amount, payments: Amount, credits: Amount): Money {
  return money(D(total).minus(D(payments)).minus(D(credits)));
}

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────
const fmtCache = new Map<string, Intl.NumberFormat>();
export function formatMoney(v: Amount, currency = "EUR", opts: { compact?: boolean; lang?: "en" | "sq" } = {}): string {
  if (isMissing(v)) return "—";
  if (opts.lang === "sq") return sqMoney(D(v).toDecimalPlaces(2).toNumber(), currency, opts.compact);
  const locale = "en-IE";
  const key = `${locale}:${currency}:${opts.compact ? 1 : 0}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(opts.compact
        ? { notation: "compact", maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    fmtCache.set(key, f);
  }
  // Intl receives a string to avoid float rounding of the decimal value.
  return f.format(D(v).toDecimalPlaces(2).toNumber());
}

export function formatPct(v: string | null | undefined, lang: "en" | "sq" = "en"): string {
  if (v === null || v === undefined) return "—";
  return lang === "sq" ? `${v.replace(".", ",")}%` : `${v}%`;
}

/** For chart libraries only — never for arithmetic. */
export const toChartNumber = (v: Amount) => D(v).toNumber();
