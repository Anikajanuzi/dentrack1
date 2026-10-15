"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { toast } from "@/lib/toast";
import { CircleCheck, CircleDashed, CircleDot, Info, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import type { CaseData } from "@/lib/data/cases";
import {
  addLaborEntryAction, addMaterialCostAction, addOtherCostAction, deleteCostAction, setSectionConfirmedAction,
} from "@/lib/actions/costs";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChartTooltipBox } from "@/components/charts/chart-tooltip";
import {
  caseFinancials, costBreakdown, lineTotal, SECTION_STATE_LABEL, toChartNumber, type CostBreakdown, type SectionState,
} from "@/lib/finance";
import { cn } from "@/lib/utils";

export const OTHER_COST_LABELS: Record<string, string> = {
  outsourcing: "Outsourcing",
  external_milling: "External milling",
  external_scanning: "External scanning",
  external_3d_printing: "External 3D printing",
  specialized_finishing: "Specialized finishing",
  equipment_rental: "Case-specific equipment rental",
  logistics: "Case-specific delivery / logistics",
  packaging: "Special protective packaging",
  remake: "Remake expenses",
  additional_materials: "Additional materials",
  external_services: "Additional external services",
  other: "Other documented direct cost",
};

const SERIES = [
  { key: "materials", name: "Materials", color: "var(--chart-1)" },
  { key: "labor", name: "Labor", color: "var(--chart-2)" },
  { key: "other", name: "Other direct costs", color: "var(--chart-3)" },
] as const;

type Costs = NonNullable<CaseData["costs"]>;

export function CostBreakdownTab({ data }: { data: CaseData }) {
  const costs = data.costs!;
  const cur = data.currency;
  const b = costBreakdown(costs.summary);
  const editable = !data.c.archived_at;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <MaterialsSection data={data} costs={costs} state={b.states.materials} total={b.materials} editable={editable} />
        <LaborSection data={data} costs={costs} state={b.states.labor} total={b.labor} editable={editable} />
        <OtherSection data={data} costs={costs} state={b.states.other} total={b.other} editable={editable} />
      </div>
      <div className="flex flex-col gap-5 xl:sticky xl:top-20 xl:self-start">
        <SummaryCard b={b} cur={cur} estimated={data.finance?.estimated_direct_cost ?? null} />
        {data.finance && <FinancialSummaryCard data={data} b={b} />}
        <DistributionCard b={b} cur={cur} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section chrome
// ─────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: SectionState }) {
  const map = {
    missing: { tone: "warn" as const, icon: <CircleDashed /> },
    incomplete: { tone: "info" as const, icon: <CircleDot /> },
    confirmed: { tone: "ok" as const, icon: <CircleCheck /> },
    confirmed_zero: { tone: "ok" as const, icon: <CircleCheck /> },
  }[state];
  return <Badge tone={map.tone} icon={map.icon}>{SECTION_STATE_LABEL[state]}</Badge>;
}

function SectionCard({
  title, description, total, cur, state, caseId, section, editable, adding, onAdd, children, form,
}: {
  title: string; description: string; total: string; cur: string; state: SectionState; caseId: string;
  section: "materials" | "labor" | "other"; editable: boolean; adding: boolean; onAdd: () => void;
  children: React.ReactNode; form: React.ReactNode;
}) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const confirmed = state === "confirmed" || state === "confirmed_zero";
  async function toggle(v: boolean) {
    setBusy(true);
    const r = await setSectionConfirmedAction(caseId, section, v);
    setBusy(false);
    if (r.ok) router.refresh(); else toast.error(r.error);
  }
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[16px] font-semibold text-ink">{t(title)}</h3>
            <StateBadge state={state} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{t(description)}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-xs text-muted">{t("Section total")}</p>
          <p className="text-[17px] font-semibold tabular text-ink">{state === "missing" ? t("Not recorded") : fmt.money(total, cur)}</p>
        </div>
      </div>
      {children}
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden border-t border-line bg-surface-2/50"
          >
            {form}
          </motion.div>
        )}
      </AnimatePresence>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          {!adding ? (
            <Button variant="secondary" size="sm" onClick={onAdd}><Plus /> {t(section === "other" ? "Add cost" : section === "labor" ? "Add labor" : "Add material")}</Button>
          ) : <span />}
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <Switch checked={confirmed} onCheckedChange={toggle} disabled={busy} aria-label={t("{0} complete", { 0: t(title) })} />
            {section === "other" ? t("All other direct costs recorded (none is fine)") : t("All {0} recorded", { 0: title.toLowerCase() })}
          </label>
        </div>
      )}
    </Card>
  );
}

function DeleteEntry({ kind, id, label }: { kind: "material" | "labor" | "other"; id: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("Remove {0}", { 0: label })}
      loading={busy}
      onClick={async () => {
        if (!confirm(t("Remove \"{0}\"? The change is kept in the audit log.", { 0: label }))) return;
        setBusy(true);
        const r = await deleteCostAction(kind, id);
        setBusy(false);
        if (r.ok) { toast.success("Entry removed"); router.refresh(); } else toast.error(r.error);
      }}
      className="text-muted hover:text-danger"
    >
      {!busy && <Trash2 />}
    </Button>
  );
}

function EstimateTag() {
  const { t } = useI18n();
  return <Badge tone="warn" className="ml-1.5 h-5 text-[11px]">{t("Estimate")}</Badge>;
}
const td = "px-4 py-2.5 align-top";
const th = "px-4 py-2 text-left text-xs font-medium text-muted";

// ─────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────
function MaterialsSection({ data, costs, state, total, editable }: { data: CaseData; costs: Costs; state: SectionState; total: string; editable: boolean }) {
  const { fmt, t } = useI18n();
  const cur = data.currency;
  const [adding, setAdding] = React.useState(false);
  return (
    <SectionCard
      title={t("Material costs")}
      description="Quantity actually consumed × unit cost. Partial use of a block or bottle is recorded as a fraction."
      total={total} cur={cur} state={state} caseId={data.c.id} section="materials" editable={editable}
      adding={adding} onAdd={() => setAdding(true)}
      form={<MaterialForm data={data} costs={costs} onClose={() => setAdding(false)} />}
    >
      {costs.materials.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-muted">{state === "confirmed_zero" ? t("Confirmed: no materials were used.") : t("No materials recorded yet.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="border-b border-line"><tr><th className={th}>{t("Material")}</th><th className={cn(th, "text-right")}>{t("Quantity")}</th><th className={cn(th, "text-right")}>{t("Unit cost")}</th><th className={cn(th, "text-right")}>{t("Total")}</th><th className="w-10" /></tr></thead>
            <tbody>
              {costs.materials.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <span className="font-medium text-ink">{m.material_name}</span>
                    {m.basis === "estimate" && <EstimateTag />}
                    <span className="block text-xs text-muted">{fmt.day(m.recorded_on)}{m.notes ? ` · ${m.notes}` : ""}</span>
                  </td>
                  <td className={cn(td, "text-right tabular")}>{fmt.num(Number(m.quantity), 3)} {m.unit}</td>
                  <td className={cn(td, "text-right tabular text-ink-2")}>{fmt.money(m.unit_cost, cur)}<span className="text-muted"> /{m.unit}</span></td>
                  <td className={cn(td, "text-right font-medium tabular")}>{fmt.money(m.line_total, cur)}</td>
                  <td className="pr-2 pt-1.5 text-right">{editable && <DeleteEntry kind="material" id={m.id} label={m.material_name} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function FormShell({ children, onSubmit, onClose, busy, submitLabel }: { children: React.ReactNode; onSubmit: (e: React.FormEvent) => void; onClose: () => void; busy: boolean; submitLabel: string }) {
  const { t } = useI18n();
  return (
    <form onSubmit={onSubmit} className="px-5 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}><X /> {t("Cancel")}</Button>
        <Button type="submit" size="sm" loading={busy}>{t(submitLabel)}</Button>
      </div>
    </form>
  );
}

function BasisSelect({ value, onChange, id }: { value: string; onChange: (v: "actual" | "estimate") => void; id: string }) {
  const { t } = useI18n();
  return (
    <Field label="Recorded as" htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as "actual" | "estimate")}>
        <option value="actual">{t("Actual cost")}</option>
        <option value="estimate">{t("Estimate")}</option>
      </Select>
    </Field>
  );
}

function MaterialForm({ data, costs, onClose }: { data: CaseData; costs: Costs; onClose: () => void }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [materialId, setMaterialId] = React.useState("");
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [basis, setBasis] = React.useState<"actual" | "estimate">("actual");
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const item = costs.catalog.find((m) => m.id === materialId);

  React.useEffect(() => {
    if (item) { setUnit(item.unit); setUnitCost(item.default_unit_cost ?? ""); setName(""); }
  }, [item]);

  const preview = /^\d+([.,]\d+)?$/.test(qty) && /^\d+([.,]\d+)?$/.test(unitCost) ? lineTotal(qty.replace(",", "."), unitCost.replace(",", ".")) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addMaterialCostAction(data.c.id, { material_id: materialId, material_name: name, unit, quantity: qty, unit_cost: unitCost, basis, notes });
    setBusy(false);
    if (r.ok) { toast.success("Material recorded"); onClose(); router.refresh(); }
    else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
  }

  return (
    <FormShell onSubmit={submit} onClose={onClose} busy={busy} submitLabel="Save material">
      <Field label="From catalog" htmlFor="m-cat" className="sm:col-span-2" hint={costs.catalog.length === 0 ? t("The catalog is empty — enter the material manually.") : undefined}>
        <Select id="m-cat" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
          <option value="">{t("Enter manually")}</option>
          {costs.catalog.map((m) => <option key={m.id} value={m.id}>{m.name}{m.default_unit_cost ? ` — ${fmt.money(m.default_unit_cost, data.currency)}/${m.unit}` : t(" — no default cost")}</option>)}
        </Select>
      </Field>
      {!materialId && (
        <Field label="Material name" htmlFor="m-name" error={errors.material_name}>
          <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Ceramic powder")} />
        </Field>
      )}
      <Field label="Unit" htmlFor="m-unit" error={errors.unit}>
        <Input id="m-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("g, ml, block…")} disabled={!!materialId} />
      </Field>
      <Field label="Quantity used" htmlFor="m-qty" error={errors.quantity}>
        <Input id="m-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 0.25" autoFocus />
      </Field>
      <Field label={t("Unit cost ({0})", { 0: data.currency })} htmlFor="m-cost" error={errors.unit_cost} hint={item ? t("Catalog price today; editable.") : undefined}>
        <Input id="m-cost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
      </Field>
      <BasisSelect id="m-basis" value={basis} onChange={setBasis} />
      <Field label="Note" htmlFor="m-note">
        <Input id="m-note" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Optional")} />
      </Field>
      <div className="flex items-end text-[13px] text-muted lg:col-span-2">
        {preview ? <span>{t("Line total:")} <span className="font-semibold text-ink tabular">{fmt.money(preview, data.currency)}</span></span> : t("Line total appears when quantity and unit cost are entered.")}
      </div>
    </FormShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Labor
// ─────────────────────────────────────────────────────────────
function LaborSection({ data, costs, state, total, editable }: { data: CaseData; costs: Costs; state: SectionState; total: string; editable: boolean }) {
  const { fmt, t } = useI18n();
  const cur = data.currency;
  const [adding, setAdding] = React.useState(false);
  return (
    <SectionCard
      title={t("Labor costs")}
      description="Hours worked × the hourly labor cost in Settings, or a manual amount when hours aren't tracked."
      total={total} cur={cur} state={state} caseId={data.c.id} section="labor" editable={editable}
      adding={adding} onAdd={() => setAdding(true)}
      form={<LaborForm data={data} costs={costs} onClose={() => setAdding(false)} />}
    >
      {costs.labor.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-muted">{state === "confirmed_zero" ? t("Confirmed: no direct labor recorded for this case.") : t("No labor recorded yet.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="border-b border-line"><tr><th className={th}>{t("Technician · task")}</th><th className={cn(th, "text-right")}>{t("Hours")}</th><th className={cn(th, "text-right")}>{t("Rate")}</th><th className={cn(th, "text-right")}>{t("Total")}</th><th className="w-10" /></tr></thead>
            <tbody>
              {costs.labor.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <span className="font-medium text-ink">{l.technician_name}</span>
                    {l.basis === "estimate" && <EstimateTag />}
                    <span className="block text-xs text-muted">{l.task} · {fmt.day(l.work_date)}</span>
                  </td>
                  <td className={cn(td, "text-right tabular")}>{l.entry_type === "hours" ? `${Number(l.hours)} h` : <span className="text-muted">{t("Manual")}</span>}</td>
                  <td className={cn(td, "text-right tabular text-ink-2")}>{l.entry_type === "hours" ? `${fmt.money(l.hourly_rate, cur)}/h` : "—"}</td>
                  <td className={cn(td, "text-right font-medium tabular")}>{fmt.money(l.amount, cur)}</td>
                  <td className="pr-2 pt-1.5 text-right">{editable && <DeleteEntry kind="labor" id={l.id} label={`${l.technician_name}: ${l.task}`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function LaborForm({ data, costs, onClose }: { data: CaseData; costs: Costs; onClose: () => void }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [tech, setTech] = React.useState(data.c.technician_id ?? "");
  const [task, setTask] = React.useState("");
  const [type, setType] = React.useState<"hours" | "manual">("hours");
  const [hours, setHours] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [override, setOverride] = React.useState("");
  const [basis, setBasis] = React.useState<"actual" | "estimate">("actual");
  const [workDate, setWorkDate] = React.useState(data.today);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const rate = costs.rates.find((r) => r.technician_id === tech)?.hourly_rate ?? costs.rates.find((r) => r.technician_id === null)?.hourly_rate ?? null;
  const effectiveRate = override || rate;
  const preview = type === "hours" && /^\d+([.,]\d+)?$/.test(hours) && effectiveRate ? lineTotal(hours.replace(",", "."), effectiveRate.replace(",", ".")) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addLaborEntryAction(data.c.id, { technician_id: tech, task, entry_type: type, hours, manual_amount: amount, rate_override: override, basis, work_date: workDate });
    setBusy(false);
    if (r.ok) { toast.success("Labor recorded"); onClose(); router.refresh(); }
    else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
  }

  return (
    <FormShell onSubmit={submit} onClose={onClose} busy={busy} submitLabel="Save labor">
      <Field label="Technician" htmlFor="l-tech">
        <Select id="l-tech" value={tech} onChange={(e) => setTech(e.target.value)}>
          <option value="">{t("Not specified")}</option>
          {data.options.technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
        </Select>
      </Field>
      <Field label="Task" htmlFor="l-task" error={errors.task} className="lg:col-span-2">
        <Input id="l-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder={t("e.g. Ceramic layering")} autoFocus />
      </Field>
      <Field label="Work date" htmlFor="l-date">
        <Input id="l-date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
      </Field>
      <Field label="Recorded by" htmlFor="l-type">
        <Select id="l-type" value={type} onChange={(e) => setType(e.target.value as "hours" | "manual")}>
          <option value="hours">{t("Hours worked")}</option>
          <option value="manual">{t("Manual labor cost")}</option>
        </Select>
      </Field>
      {type === "hours" ? (
        <>
          <Field label="Hours" htmlFor="l-hours" error={errors.hours}>
            <Input id="l-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 1.5" />
          </Field>
          <Field
            label={t("Hourly labor cost ({0})", { 0: data.currency })}
            htmlFor="l-rate"
            error={errors.rate_override}
            hint={rate ? t("Configured rate {0}/h{1}", { 0: fmt.money(rate, data.currency), 1: data.perms.isAdmin ? "; override if needed." : "." }) : t("No rate configured — ask an administrator, or record a manual amount.")}
          >
            <Input id="l-rate" inputMode="decimal" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={rate ?? "—"} disabled={!data.perms.isAdmin} />
          </Field>
        </>
      ) : (
        <Field label={t("Amount ({0})", { 0: data.currency })} htmlFor="l-amount" error={errors.manual_amount} className="lg:col-span-2">
          <Input id="l-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
      )}
      <BasisSelect id="l-basis" value={basis} onChange={setBasis} />
      <div className="flex items-end text-[13px] text-muted lg:col-span-4">
        {preview ? <span>{t("Labor cost: {0} ({1} h × {2})", { 0: fmt.money(preview, data.currency), 1: hours, 2: fmt.money(effectiveRate, data.currency) })}</span> : null}
      </div>
    </FormShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Other direct costs
// ─────────────────────────────────────────────────────────────
function OtherSection({ data, costs, state, total, editable }: { data: CaseData; costs: Costs; state: SectionState; total: string; editable: boolean }) {
  const { fmt, t } = useI18n();
  const cur = data.currency;
  const [adding, setAdding] = React.useState(false);
  return (
    <SectionCard
      title={t("Other direct costs")}
      description="Expenses caused by this case alone — outsourcing, external milling, courier, remakes. Don't repeat materials or labor recorded above."
      total={total} cur={cur} state={state} caseId={data.c.id} section="other" editable={editable}
      adding={adding} onAdd={() => setAdding(true)}
      form={<OtherForm data={data} onClose={() => setAdding(false)} />}
    >
      {costs.other.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-muted">{state === "confirmed_zero" ? t("Confirmed: this case had no other direct costs.") : t("No other direct costs recorded. If there were none, switch on the confirmation below.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="border-b border-line"><tr><th className={th}>{t("Cost")}</th><th className={th}>{t("Supplier")}</th><th className={th}>{t("Date")}</th><th className={cn(th, "text-right")}>{t("Amount")}</th><th className="w-10" /></tr></thead>
            <tbody>
              {costs.other.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <span className="font-medium text-ink">{o.description}</span>
                    {o.basis === "estimate" && <EstimateTag />}
                    <span className="block text-xs text-muted">{t(OTHER_COST_LABELS[o.category] ?? o.category)}{o.notes ? ` · ${o.notes}` : ""}</span>
                  </td>
                  <td className={cn(td, "text-ink-2")}>{o.supplier ?? "—"}</td>
                  <td className={cn(td, "text-ink-2 tabular")}>{fmt.day(o.cost_date, "d MMM yyyy")}</td>
                  <td className={cn(td, "text-right font-medium tabular")}>{fmt.money(o.amount, cur)}</td>
                  <td className="pr-2 pt-1.5 text-right">{editable && <DeleteEntry kind="other" id={o.id} label={o.description} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function OtherForm({ data, onClose }: { data: CaseData; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = React.useState({ category: "outsourcing", description: "", amount: "", cost_date: data.today, supplier: "", notes: "", basis: "actual" as "actual" | "estimate" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addOtherCostAction(data.c.id, v as Parameters<typeof addOtherCostAction>[1]);
    setBusy(false);
    if (r.ok) { toast.success("Cost recorded"); onClose(); router.refresh(); }
    else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
  }

  return (
    <FormShell onSubmit={submit} onClose={onClose} busy={busy} submitLabel="Save cost">
      <Field label="Cost category" htmlFor="o-cat" className="sm:col-span-2">
        <Select id="o-cat" value={v.category} onChange={set("category")}>
          {Object.entries(OTHER_COST_LABELS).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </Select>
      </Field>
      <Field label="Description" htmlFor="o-desc" error={errors.description} className="sm:col-span-2">
        <Input id="o-desc" value={v.description} onChange={set("description")} placeholder={t("e.g. External milling of framework")} autoFocus />
      </Field>
      <Field label={t("Amount ({0})", { 0: data.currency })} htmlFor="o-amount" error={errors.amount}>
        <Input id="o-amount" inputMode="decimal" value={v.amount} onChange={set("amount")} placeholder="0.00" />
      </Field>
      <Field label="Date" htmlFor="o-date" error={errors.cost_date}>
        <Input id="o-date" type="date" value={v.cost_date} onChange={set("cost_date")} />
      </Field>
      <Field label="Supplier" htmlFor="o-sup">
        <Input id="o-sup" value={v.supplier} onChange={set("supplier")} placeholder={t("Optional")} />
      </Field>
      <BasisSelect id="o-basis" value={v.basis} onChange={(b) => setV((s) => ({ ...s, basis: b }))} />
      <Field label="Notes" htmlFor="o-notes" className="sm:col-span-2 lg:col-span-4">
        <Input id="o-notes" value={v.notes} onChange={set("notes")} placeholder={t("Optional, e.g. invoice number")} />
      </Field>
    </FormShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Right column
// ─────────────────────────────────────────────────────────────
function SummaryCard({ b, cur, estimated }: { b: CostBreakdown; cur: string; estimated: string | null }) {
  const { fmt, t } = useI18n();
  const rows = [
    { name: "Materials", value: b.materials, state: b.states.materials },
    { name: "Labor", value: b.labor, state: b.states.labor },
    { name: "Other direct costs", value: b.other, state: b.states.other },
  ];
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">{t("Cost breakdown summary")}</h3>
      <dl className="mt-3 divide-y divide-line text-[13px]">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-ink-2">{r.name}</dt>
            <dd className="tabular">
              {r.state === "missing" ? <span className="text-warn">{t("Not recorded")}</span> : fmt.money(r.value, cur)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pt-3">
          <dt className="font-semibold text-ink">{t("Total recorded direct cost")}</dt>
          <dd>
            <motion.span key={b.total} initial={{ opacity: 0.3, y: -4 }} animate={{ opacity: 1, y: 0 }} className="block text-[20px] font-semibold tabular text-ink">
              {fmt.money(b.total, cur)}
            </motion.span>
          </dd>
        </div>
      </dl>
      {!b.complete && (
        <div className="mt-3 flex gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {b.openSections.length > 0 && <>{t("Not yet confirmed: {0}.", { 0: b.openSections.map((s) => t(s === "other" ? "other direct costs" : s)).join(", ") })} </>}
            {b.hasEstimates && <>{t("Some entries are estimates.")} </>}
            {t("The true direct cost may be higher than shown.")}
          </span>
        </div>
      )}
      {estimated && (
        <p className="mt-3 text-xs text-muted">{t("Planning estimate entered at intake: {0} (not included above).", { 0: fmt.money(estimated, cur) })}</p>
      )}
      <p className="mt-3 text-[11px] text-muted">{t("Rent, utilities and other overheads are not allocated to cases. They are tracked as operating expenses.")}</p>
    </Card>
  );
}

export function FinancialSummaryCard({ data, b }: { data: CaseData; b: CostBreakdown }) {
  const { fmt, t } = useI18n();
  const f = caseFinancials({
    selling_price: data.finance!.selling_price,
    discount_amount: data.finance!.discount_amount,
    costs: b,
    billing: data.finance!.billing,
  });
  const cur = data.currency;
  const negative = f.profit !== null && f.profit.startsWith("-");
  const rows: Array<{ k: string; v: React.ReactNode; strong?: boolean; sep?: boolean }> = [
    { k: "Selling price", v: f.sellingPrice ? fmt.money(f.sellingPrice, cur) : <span className="text-warn">{t("No price set")}</span> },
    { k: "Discount", v: f.discount === "0.00" ? fmt.money(0, cur) : `− ${fmt.money(f.discount, cur)}` },
    { k: "Net selling price", v: fmt.money(f.netSellingPrice, cur), strong: true },
    { k: "Total recorded direct cost", v: `− ${fmt.money(f.totalDirectCost, cur)}` },
    { k: f.profitLabel, v: <span className={cn(negative && "text-danger")}>{fmt.money(f.profit, cur)}</span>, strong: true },
    { k: f.profitIsComplete ? "Gross profit margin" : "Contribution margin", v: fmt.pct(f.marginPct) },
    { k: "Amount billed", v: fmt.money(f.amountBilled, cur), sep: true },
    { k: "Payments received", v: fmt.money(f.paymentsReceived, cur) },
    ...(f.creditsApplied !== "0.00" ? [{ k: "Credits applied", v: fmt.money(f.creditsApplied, cur) }] : []),
    { k: "Outstanding balance", v: fmt.money(f.outstanding, cur), strong: true },
  ];
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">{t("Financial summary")}</h3>
      <dl className="mt-3 text-[13px]">
        {rows.map((r) => (
          <div key={r.k} className={cn("flex items-center justify-between gap-3 py-1.5", r.sep && "mt-2 border-t border-line pt-3.5")}>
            <dt className={cn(r.strong ? "font-semibold text-ink" : "text-ink-2")}>{t(r.k)}</dt>
            <dd className={cn("tabular", r.strong && "font-semibold")}>{r.v}</dd>
          </div>
        ))}
      </dl>
      {!f.profitIsComplete && (
        <p className="mt-3 flex gap-2 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> {t("Shown as contribution after recorded costs because the cost record is incomplete. It is not gross or net profit.")}
        </p>
      )}
      {f.proRata && <p className="mt-2 text-xs text-muted">{t("This case shares an invoice with other cases; payments are attributed in proportion to its line amount.")}</p>}
      {f.amountBilled === "0.00" && f.netSellingPrice && <p className="mt-2 text-xs text-muted">{t("Not invoiced yet. The selling price is not revenue until the case is delivered.")}</p>}
    </Card>
  );
}

function DistributionCard({ b, cur }: { b: CostBreakdown; cur: string }) {
  const { fmt, t } = useI18n();
  const data = SERIES.map((s) => ({ ...s, value: toChartNumber(b[s.key]), money: b[s.key], share: b.shares[s.key] }));
  const hasData = data.some((d) => d.value > 0);
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">{t("Cost distribution")}</h3>
      {!hasData ? (
        <p className="py-8 text-center text-[13px] text-muted">{t("The distribution appears once costs are recorded.")}</p>
      ) : (
        <>
          <div className="relative mx-auto mt-2 h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={1.5} stroke="var(--surface)" strokeWidth={2} animationDuration={600} isAnimationActive>
                  {data.filter((d) => d.value > 0).map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <RTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof data)[number];
                    return <ChartTooltipBox label={t(p.name)} rows={[{ name: t("Amount"), value: fmt.money(p.money, cur), color: p.color }, { name: t("Share"), value: fmt.pct(p.share) }]} />;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted">{t("Total")}</span>
              <span className="text-[17px] font-semibold tabular">{fmt.money(b.total, cur)}</span>
            </div>
          </div>
          <ul className="mt-5 space-y-3" aria-label={t("Cost distribution")}>
            {data.map((d) => (
              <li key={d.key}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-ink-2"><span className="size-2.5 rounded-[3px]" style={{ background: d.color }} />{t(d.name)}</span>
                  <span className="tabular text-ink">{fmt.money(d.money, cur)} <span className="ml-1 text-muted">{fmt.pct(d.share)}</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(d.share ?? 0)} aria-label={`${t(d.name)} ${fmt.pct(d.share)}`}>
                  <motion.div className="h-full rounded-full" style={{ background: d.color }} initial={{ width: 0 }} animate={{ width: `${d.share ?? 0}%` }} transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">{t("Percentages are rounded to one decimal and may not sum to exactly 100%.")}</p>
        </>
      )}
    </Card>
  );
}
