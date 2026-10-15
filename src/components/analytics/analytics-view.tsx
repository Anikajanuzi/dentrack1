"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { Info, TriangleAlert } from "lucide-react";
import type { getAnalytics } from "@/lib/data/analytics";
import { PRESETS } from "@/lib/period";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Card, CardHeader, AnimatedNumber } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartTooltipBox, Legend, axisProps } from "@/components/charts/chart-tooltip";
import { D, money, pct, toChartNumber } from "@/lib/finance";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof getAnalytics>>;

interface Production {
  definitions: Record<string, string>;
  occupancy: { active: number; occupied: number; rate: number | null };
  production_time: { cases: number; avg_days: number | null; min_days: number | null; max_days: number | null };
  completion: { population: number; completed: number; on_time: number; rate: number | null; on_time_rate: number | null };
  received: number;
  completed: number;
  by_month: { month: string; received: number; completed: number }[];
  by_category: { category: string; received: number }[];
  by_technician: { technician_id: string; name: string; active_now: number; completed: number; recorded_hours: number | string | null }[];
}

interface Finance {
  currency: string;
  policy: string;
  kpis: {
    billed_sales: string; credits_issued: string; recognized_revenue: string; recognized_cases: number; recognized_cases_missing_price: number;
    payments_received: string | null; outstanding_receivables: string; recorded_production_costs: string; matched_direct_cost: string;
    gross_profit: string; gross_margin_pct: string | null; cost_records_complete: boolean; cases_with_complete_costs: number;
    operating_expenses: string | null; operating_profit: string | null;
  };
  monthly: { month: string; billed_sales: string; recognized_revenue: string; payments_received: string | null; direct_costs: string; operating_expenses: string | null }[];
  cost_distribution: { materials: string; labor: string; other: string };
  by_category: { id: string; name: string; cases: number; revenue: string; direct_cost: string; gross_profit: string; complete_cases: number; complete_revenue: string; complete_direct_cost: string }[];
  by_service: { id: string | null; name: string; cases: number; revenue: string; direct_cost: string; complete_cases: number; complete_revenue: string; complete_direct_cost: string }[];
  incomplete_cost_cases: { id: string; reference: string; lifecycle: string; materials: string; labor: string; other: string; estimates: number }[];
}


export function AnalyticsView({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [tab, setTab] = React.useState(d.isAdmin && sp.get("tab") === "financial" ? "financial" : "production");
  const [pending, start] = React.useTransition();
  const [custom, setCustom] = React.useState({ from: d.period.from, to: d.period.to });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    next.set("tab", tab);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const p = d.production as unknown as Production;
  const f = d.finance as unknown as Finance | null;

  return (
    <Tabs value={tab} onValueChange={(item) => { setTab(item); const n = new URLSearchParams(sp.toString()); n.set("tab", item); router.replace(`${pathname}?${n}`, { scroll: false }); }}>
      {/* Filters: one row above every chart */}
      <div className="mb-5 flex flex-wrap items-end gap-2">
        <Select aria-label={t("Period")} className="w-auto" value={d.period.preset} onChange={(e) => set({ preset: e.target.value, from: null, to: null })}>
          {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
        {d.period.preset === "custom" && (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); set({ preset: "custom", from: custom.from, to: custom.to }); }}>
            <Input type="date" aria-label={t("From")} className="w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span className="text-muted">{t("to")}</span>
            <Input type="date" aria-label={t("To")} className="w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            <Button type="submit" variant="secondary" size="sm">{t("Apply")}</Button>
          </form>
        )}
        {tab === "financial" && (
          <>
            <Select aria-label={t("Category")} className="w-auto max-w-56" value={d.filters.category ?? ""} onChange={(e) => set({ category: e.target.value || null })}>
              <option value="">{t("All prosthetics")}</option>
              {d.options.categories.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
            </Select>
            <Select aria-label={t("Clinic")} className="w-auto max-w-56" value={d.filters.clinic ?? ""} onChange={(e) => set({ clinic: e.target.value || null })}>
              <option value="">{t("All clinics")}</option>
              {d.options.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select aria-label={t("Technician")} className="w-auto max-w-56" value={d.filters.technician ?? ""} onChange={(e) => set({ technician: e.target.value || null })}>
              <option value="">{t("All technicians")}</option>
              {d.options.technicians.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </>
        )}
        <span className="ml-auto text-[13px] text-muted">{fmt.day(d.period.from)} – {fmt.day(d.period.to)}</span>
      </div>

      {d.isAdmin && (
        <TabsList id="analytics" value={tab} items={[{ value: "production", label: "Production" }, { value: "financial", label: "Financial" }]} className="mb-5" />
      )}

      <div className={cn("transition-opacity", pending && "opacity-60")}>
        <TabsContent value="production"><ProductionTab p={p} canManageCosts={d.canManageCosts} /></TabsContent>
        {f && <TabsContent value="financial"><FinancialTab f={f} filtered={Object.values(d.filters).some(Boolean)} /></TabsContent>}
      </div>
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────────
function Metric({ label, value, sub, help, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; help?: string; tone?: "danger" | "muted" }) {
  const { t } = useI18n();
  return (
    <div className="bg-surface px-4 py-4">
      <p className="type-label flex items-center gap-1" title={t(help)}>{t(label)}{help && <Info className="size-3" aria-label={t(help)} />}</p>
      <p className={cn("mt-1.5 font-display text-[23px] font-semibold tracking-[-0.02em] tabular", tone === "danger" && "text-danger", tone === "muted" && "text-muted")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{typeof sub === "string" ? t(sub) : sub}</p>}
    </div>
  );
}

function ProductionTab({ p, canManageCosts }: { p: Production; canManageCosts: boolean }) {
  const { t, fmt } = useI18n();
  const cats = p.by_category.slice(0, 8);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-5">
        <Metric label="Tray occupancy (now)" value={p.occupancy.rate === null ? "—" : `${fmt.num(Number(p.occupancy.rate), 1)}%`} sub={t("{0} of {1} active trays", { 0: p.occupancy.occupied, 1: p.occupancy.active })} help={p.definitions.occupancy_rate} />
        <Metric label="Cases received" value={<AnimatedNumber value={p.received} />} sub="by date received" />
        <Metric label="Cases completed" value={<AnimatedNumber value={p.completed} />} sub="by completion date" />
        <Metric label="Avg. production time" value={p.production_time.avg_days === null ? "—" : t("{0} days", { 0: fmt.num(Number(p.production_time.avg_days), 1) })} sub={p.production_time.cases ? t("{0} cases · range {1}–{2} days", { 0: p.production_time.cases, 1: p.production_time.min_days, 2: p.production_time.max_days }) : t("no completions")} help={p.definitions.avg_production_days} />
        <Metric label="Completion rate" value={p.completion.rate === null ? "—" : `${fmt.num(Number(p.completion.rate), 1)}%`} sub={p.completion.population ? t("{0} of {1} due · on time {2}%", { 0: p.completion.completed, 1: p.completion.population, 2: p.completion.on_time_rate === null ? "—" : fmt.num(Number(p.completion.on_time_rate), 1) }) : t("no cases due")} help={p.definitions.completion_rate} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={t("Received and completed per month")} description="Number of cases" action={<Legend items={[{ name: "Received", color: "var(--chart-2)" }, { name: "Completed", color: "var(--chart-1)" }]} />} />
          <div className="h-72 px-2 pb-4 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.by_month} barGap={2} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => fmt.day(`${m}-01`, "MMM yy")} />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <RTooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload, label }) => active && payload?.length ? (
                  <ChartTooltipBox label={fmt.day(`${String(label)}-01`, "MMM yyyy")} rows={[
                    { name: "Received", value: payload.find((x) => x.dataKey === "received")?.value as number, color: "var(--chart-2)" },
                    { name: "Completed", value: payload.find((x) => x.dataKey === "completed")?.value as number, color: "var(--chart-1)" },
                  ]} />) : null} />
                <Bar dataKey="received" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="completed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("Cases received by prosthetic")} description="In the selected period" />
          <ul className="space-y-3 px-5 pb-5 pt-4">
            {cats.length === 0 && <li className="py-6 text-center text-[13px] text-muted">{t("No cases received in this period.")}</li>}
            {cats.map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex justify-between text-[13px]"><span className="text-ink-2">{t(c.category)}</span><span className="font-medium tabular">{c.received}</span></div>
                <div className="h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(c.received / Math.max(...cats.map((x) => x.received))) * 100}%`, background: "var(--chart-1)" }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("Workload by technician")} description="Active cases right now; completed cases and recorded labor hours in the period. Case counts are not hours." />
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="text-xs text-muted"><tr><th className="px-3 py-2 text-left font-medium">{t("Technician")}</th><th className="px-3 py-2 text-right font-medium">{t("Active now")}</th><th className="px-3 py-2 text-right font-medium">{t("Completed in period")}</th>{canManageCosts && <th className="px-3 py-2 text-right font-medium">{t("Recorded hours")}</th>}</tr></thead>
            <tbody>
              {p.by_technician.map((item) => (
                <tr key={item.technician_id} className="border-t border-line">
                  <td className="px-3 py-2.5"><Link href={`/team/${item.technician_id}`} className="font-medium hover:text-primary">{item.name}</Link></td>
                  <td className="px-3 py-2.5 text-right tabular">{item.active_now}</td>
                  <td className="px-3 py-2.5 text-right tabular">{item.completed}</td>
                  {canManageCosts && <td className="px-3 py-2.5 text-right tabular">{fmt.num(Number(item.recorded_hours ?? 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <details className="rounded-xl border border-line bg-surface px-5 py-3 text-[13px] text-ink-2 [&_summary]:cursor-pointer">
        <summary className="font-medium text-ink">{t("How these figures are calculated")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {Object.entries(p.definitions).map(([k, v]) => <li key={k}>{t(v)}.</li>)}
          <li>{t("Dates use the laboratory's timezone. Cancelled cases are excluded from completion statistics.")}</li>
        </ul>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function FinancialTab({ f, filtered }: { f: Finance; filtered: boolean }) {
  const { tn, fmt, t } = useI18n();
  const k = f.kpis;
  const cur = f.currency;
  const m = (v: string | null) => (v === null ? "—" : fmt.money(v, cur));
  const negative = (v: string | null) => v !== null && v.startsWith("-");
  const monthly = f.monthly.map((r) => ({
    month: r.month,
    billed: toChartNumber(r.billed_sales),
    recognized: toChartNumber(r.recognized_revenue),
    payments: r.payments_received === null ? null : toChartNumber(r.payments_received),
    costs: toChartNumber(r.direct_costs),
    raw: r,
  }));
  const dist = [
    { name: "Materials", v: f.cost_distribution.materials, color: "var(--chart-1)" },
    { name: "Labor", v: f.cost_distribution.labor, color: "var(--chart-2)" },
    { name: "Other direct costs", v: f.cost_distribution.other, color: "var(--chart-3)" },
  ];
  const distTotal = money(dist.reduce((a, x) => a.plus(D(x.v)), D(0)));
  const profitLabel = k.cost_records_complete ? "Gross profit" : "Contribution after recorded costs";

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 text-[13px] text-muted"><Info className="mt-0.5 size-4 shrink-0" />{f.policy} {t("Billed sales count issued invoices by issue date; payments count by the date received.")}</p>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Billed sales" value={m(k.billed_sales)} sub={D(k.credits_issued).gt(0) ? t("{0} credited", { 0: fmt.money(k.credits_issued, cur) }) : t("invoices issued")} />
        <Metric label="Recognized revenue" value={m(k.recognized_revenue)} sub={tn(k.recognized_cases, "{n} delivered case", "{n} delivered cases") + (k.recognized_cases_missing_price ? " · " + t("{0} without price", { 0: k.recognized_cases_missing_price }) : "")} />
        <Metric label="Payments received" value={k.payments_received === null ? "—" : m(k.payments_received)} sub={k.payments_received === null ? t("not attributable to a category or technician") : t("cash in")} tone={k.payments_received === null ? "muted" : undefined} />
        <Metric label="Outstanding receivables" value={m(k.outstanding_receivables)} sub="all open invoices, today" />
        <Metric label="Recorded production costs" value={m(k.recorded_production_costs)} sub="direct costs dated in the period" />
        <Metric label={profitLabel} value={m(k.gross_profit)} sub={t("revenue − {0} direct cost of delivered cases", { 0: fmt.money(k.matched_direct_cost, cur) })} tone={negative(k.gross_profit) ? "danger" : undefined} />
        <Metric label={k.cost_records_complete ? t("Gross profit margin") : t("Contribution margin")} value={fmt.pct(k.gross_margin_pct)} sub="of recognized revenue" />
        <Metric label="Operating expenses" value={k.operating_expenses === null ? "—" : m(k.operating_expenses)} sub={k.operating_expenses === null ? t("lab-wide; clear filters to include") : t("rent, utilities, software…")} tone={k.operating_expenses === null ? "muted" : undefined} />
        <Metric
          label="Operating profit"
          value={k.operating_profit === null ? "—" : m(k.operating_profit)}
          sub={k.operating_profit === null ? t("only for the whole laboratory") : t("before tax, interest & depreciation not recorded here")}
          tone={k.operating_profit === null ? "muted" : negative(k.operating_profit) ? "danger" : undefined}
        />
        <Metric label="Cases with complete costs" value={`${k.cases_with_complete_costs} / ${k.recognized_cases}`} sub="among delivered cases in the period" />
      </div>

      {!k.cost_records_complete && k.recognized_cases > 0 && (
        <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {tn(k.recognized_cases - k.cases_with_complete_costs, "{n} delivered case has incomplete cost records, so profit is shown as contribution after recorded costs and may be overstated.", "{n} delivered cases have incomplete cost records, so profit is shown as contribution after recorded costs and may be overstated.")} {filtered && t("Operating figures are hidden while filters are applied because overheads aren't allocated to categories, clinics or technicians.")}
          </span>
        </div>
      )}

      <Card>
        <CardHeader
          title={t("Monthly billing, revenue and payments")}
          description={t("{0} per month", { 0: cur })}
          action={<Legend items={[{ name: "Billed", color: "var(--chart-2)" }, { name: "Recognized revenue", color: "var(--chart-1)" }, ...(filtered ? [] : [{ name: "Payments received", color: "var(--chart-3)" }])]} />}
        />
        <div className="h-72 px-2 pb-4 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => fmt.day(`${m}-01`, "MMM yy")} />
              <YAxis {...axisProps} width={56} tickFormatter={(v) => fmt.money(v, cur, { compact: true })} />
              <RTooltip cursor={{ stroke: "var(--border-strong)" }} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const r = (payload[0].payload as (typeof monthly)[number]).raw;
                return <ChartTooltipBox label={fmt.day(`${String(label)}-01`, "MMM yyyy")} rows={[
                  { name: "Billed", value: fmt.money(r.billed_sales, cur), color: "var(--chart-2)" },
                  { name: "Recognized", value: fmt.money(r.recognized_revenue, cur), color: "var(--chart-1)" },
                  ...(r.payments_received === null ? [] : [{ name: "Payments", value: fmt.money(r.payments_received, cur), color: "var(--chart-3)" }]),
                ]} />;
              }} />
              <Line type="linear" dataKey="billed" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-2)" }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
              <Line type="linear" dataKey="recognized" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />
              {!filtered && <Line type="linear" dataKey="payments" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-3)" }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={t("Direct production costs per month")} description={t("{0}, by the date each cost was recorded", { 0: cur })} />
          <div className="h-64 px-2 pb-4 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => fmt.day(`${m}-01`, "MMM yy")} />
                <YAxis {...axisProps} width={56} tickFormatter={(v) => fmt.money(v, cur, { compact: true })} />
                <RTooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload, label }) => active && payload?.length ? (
                  <ChartTooltipBox label={fmt.day(`${String(label)}-01`, "MMM yyyy")} rows={[{ name: "Direct costs", value: fmt.money((payload[0].payload as (typeof monthly)[number]).raw.direct_costs, cur), color: "var(--chart-2)" }]} />) : null} />
                <Bar dataKey="costs" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("Cost distribution")} description={t("Total {0}", { 0: fmt.money(distTotal, cur) })} />
          <ul className="space-y-3 px-5 pb-5 pt-4">
            {dist.map((x) => (
              <li key={x.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-ink-2"><span className="size-2.5 rounded-[3px]" style={{ background: x.color }} />{t(x.name)}</span>
                  <span className="tabular">{fmt.money(x.v, cur)} <span className="text-muted">{fmt.pct(pct(x.v, distTotal))}</span></span>
                </div>
                <div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct(x.v, distTotal) ?? 0}%`, background: x.color }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ProfitabilityTable title={t("Profitability by prosthetic category")} rows={f.by_category} cur={cur} />
      <ProfitabilityTable title={t("Revenue and cost by service")} rows={f.by_service} cur={cur} />

      <Card>
        <CardHeader title={t("Cases with incomplete cost records")} description="Completed or delivered cases where a cost section isn't confirmed or contains estimates." />
        {f.incomplete_cost_cases.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">{t("Every completed case has a confirmed cost record.")}</p>
        ) : (
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="text-xs text-muted"><tr><th className="px-3 py-2 text-left font-medium">{t("Case")}</th><th className="px-3 py-2 text-left font-medium">{t("Materials")}</th><th className="px-3 py-2 text-left font-medium">{t("Labor")}</th><th className="px-3 py-2 text-left font-medium">{t("Other")}</th><th className="px-3 py-2 text-right font-medium">{t("Estimates")}</th></tr></thead>
              <tbody>
                {f.incomplete_cost_cases.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2"><Link href={`/cases/${c.id}?tab=costs`} className="font-semibold hover:text-primary">{c.reference}</Link></td>
                    {[c.materials, c.labor, c.other].map((s, i) => (
                      <td key={i} className="px-3 py-2"><Badge tone={s === "confirmed" ? "ok" : s === "missing" ? "warn" : "info"}>{s === "confirmed" ? t("Confirmed") : s === "missing" ? t("Not recorded") : t("In progress")}</Badge></td>
                    ))}
                    <td className="px-3 py-2 text-right tabular">{c.estimates || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProfitabilityTable({ title, rows, cur }: { title: string; rows: Finance["by_category"] | Finance["by_service"]; cur: string }) {
  const { fmt, t } = useI18n();
  const [rankBy, setRankBy] = React.useState<"revenue" | "profit" | "margin" | "cost">("revenue");
  // Rankings by profit/margin use only cases with complete cost records, and only when at least 3 such cases exist.
  const MIN = 3;
  const enriched = rows.map((r) => {
    const gp = money(D(r.complete_revenue).minus(D(r.complete_direct_cost)));
    return { ...r, complete_profit: gp, complete_margin: pct(gp, r.complete_revenue), rankable: r.complete_cases >= MIN };
  });
  const sorted = [...enriched].sort((a, b) => {
    if (rankBy === "revenue") return D(b.revenue).comparedTo(D(a.revenue));
    if (rankBy === "cost") return D(b.direct_cost).comparedTo(D(a.direct_cost));
    if (a.rankable !== b.rankable) return a.rankable ? -1 : 1;
    if (rankBy === "profit") return D(b.complete_profit).comparedTo(D(a.complete_profit));
    return D(b.complete_margin ?? -1e9).comparedTo(D(a.complete_margin ?? -1e9));
  });
  return (
    <Card>
      <CardHeader
        title={title}
        description={t("Delivered cases in the period. Gross profit and margin use only cases with complete cost records and are ranked only with {0}+ such cases.", { 0: MIN })}
        action={
          <Select aria-label={t("Rank by")} className="h-8 w-auto" value={rankBy} onChange={(e) => setRankBy(e.target.value as typeof rankBy)}>
            <option value="revenue">{t("Highest revenue")}</option>
            <option value="profit">{t("Highest gross profit")}</option>
            <option value="margin">{t("Highest gross margin")}</option>
            <option value="cost">{t("Highest direct cost")}</option>
          </Select>
        }
      />
      {rows.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted">{t("No delivered cases in this period.")}</p> : (
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("Name")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Cases")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Revenue")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Recorded direct cost")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Complete-cost cases")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Gross profit (complete)")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Gross margin (complete)")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id ?? r.name} className="border-t border-line">
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tabular">{r.cases}</td>
                  <td className="px-3 py-2.5 text-right tabular">{fmt.money(r.revenue, cur)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{fmt.money(r.direct_cost, cur)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{r.complete_cases} / {r.cases}</td>
                  <td className="px-3 py-2.5 text-right tabular">{r.complete_cases ? fmt.money(r.complete_profit, cur) : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular">{r.rankable ? fmt.pct(r.complete_margin) : <span className="text-xs text-muted">{r.complete_cases ? t("{0} (few cases)", { 0: fmt.pct(r.complete_margin) }) : t("insufficient data")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
