export interface Period { from: string; to: string; preset: string }

export const PRESETS: Record<string, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  ytd: "Year to date",
  last_12_months: "Last 12 months",
  last_year: "Last year",
  custom: "Custom range",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (y: number, m0: number) => iso(new Date(Date.UTC(y, m0, 1)));
const monthEnd = (y: number, m0: number) => iso(new Date(Date.UTC(y, m0 + 1, 0)));
const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Resolve a reporting period in the laboratory's calendar (whole days, inclusive). `today` is lab-local. */
export function resolvePeriod(today: string, sp: { preset?: string; from?: string; to?: string }): Period {
  const [y, m] = today.split("-").map(Number);
  const m0 = m - 1;
  switch (sp.preset) {
    case "custom":
      if (valid(sp.from) && valid(sp.to) && sp.from! <= sp.to!) return { from: sp.from!, to: sp.to!, preset: "custom" };
      break;
    case "last_month":
      return { from: monthStart(y, m0 - 1), to: monthEnd(y, m0 - 1), preset: "last_month" };
    case "last_3_months":
      return { from: monthStart(y, m0 - 2), to: today, preset: "last_3_months" };
    case "ytd":
      return { from: `${y}-01-01`, to: today, preset: "ytd" };
    case "last_12_months":
      return { from: monthStart(y, m0 - 11), to: today, preset: "last_12_months" };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, preset: "last_year" };
  }
  return { from: monthStart(y, m0), to: today, preset: "this_month" };
}
