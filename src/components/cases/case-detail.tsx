"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "@/lib/toast";
import {
  Archive, ArchiveRestore, ArrowLeft, Ban, CalendarClock, Check, ChevronRight, Download, FileText, Grid3x3, MoreHorizontal,
  PackageOpen, Pencil, Trash2, TriangleAlert, Upload, Receipt,
} from "lucide-react";
import type { CaseData } from "@/lib/data/cases";
import {
  addNoteAction, archiveCaseAction, assignCaseTrayAction, cancelCaseAction, deleteFileAction, deleteNoteAction, moveStageAction,
  restoreCaseAction, updateCaseAction, uploadFileAction,
} from "@/lib/actions/cases";
import { releaseTrayAction } from "@/lib/actions/trays";
import { updatePricingAction } from "@/lib/actions/costs";
import { createInvoiceAction } from "@/lib/actions/finance";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Badge, PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { CostBreakdownTab, FinancialSummaryCard } from "./cost-breakdown";
import { costBreakdown } from "@/lib/finance";
import { urgencyOf } from "@/lib/dates";
import { cn, trayCode } from "@/lib/utils";
import { TrayVisual } from "@/components/trays/tray-visual";

export function CaseDetail({ data }: { data: CaseData }) {
  const { t } = useI18n();
  const { c, perms } = data;
  const sp = useSearchParams();
  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "workflow", label: "Production workflow" },
    ...(perms.canManageCosts ? [{ value: "costs", label: "Cost breakdown" }] : []),
    ...(perms.isAdmin ? [{ value: "pricing", label: "Pricing & invoicing" }] : []),
    { value: "notes", label: "Notes & files", badge: data.notes.length + data.files.length ? <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular text-muted">{data.notes.length + data.files.length}</span> : undefined },
    { value: "activity", label: "Activity history" },
  ];
  const initial = sp.get("tab");
  const [tab, setTab] = React.useState(tabs.some((item) => item.value === initial) ? initial! : "overview");
  React.useEffect(() => {
    if (sp.get("created")) toast.success(t("Case {0} created", { 0: c.reference }));
  }, [sp, c.reference]);

  return (
    <div className="flex flex-col gap-5">
      <CaseHeader data={data} onTab={setTab} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList id="case" value={tab} items={tabs} />
        <div className="pt-5">
          <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>
          <TabsContent value="workflow"><WorkflowTab data={data} /></TabsContent>
          {perms.canManageCosts && <TabsContent value="costs"><CostBreakdownTab data={data} /></TabsContent>}
          {perms.isAdmin && <TabsContent value="pricing"><PricingTab data={data} /></TabsContent>}
          <TabsContent value="notes"><NotesFilesTab data={data} /></TabsContent>
          <TabsContent value="activity"><ActivityTab data={data} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────
function CaseHeader({ data, onTab }: { data: CaseData; onTab: (t: string) => void }) {
  const { fmt, t } = useI18n();
  const { c, perms } = data;
  const router = useRouter();
  const [dialog, setDialog] = React.useState<null | "edit" | "cancel" | "release" | "tray">(null);
  const u = urgencyOf(c.due_date, data.today, data.dueSoonDays, c.lifecycle);
  const stageIdx = data.options.stages.findIndex((s) => s.id === c.stage_id);
  const next = data.options.stages[stageIdx + 1];
  const [busy, setBusy] = React.useState(false);

  async function advance() {
    if (!next) return;
    setBusy(true);
    const r = await moveStageAction(c.id, next.id);
    setBusy(false);
    if (r.ok) { toast.success(t("{0} moved to {1}", { 0: c.reference, 1: t(next.name) })); router.refresh(); } else toast.error(r.error);
  }
  async function simple(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    const r = await fn();
    if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); } else toast.error(r.error);
  }

  const canEdit = perms.isAdmin || perms.isAssignee;

  return (
    <>
      <Link href={c.archived_at ? "/archive" : "/cases"} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {c.archived_at ? t("Archive") : t("Cases")}
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="type-display">{c.reference}</h1>
            {c.archived_at ? <StatusBadge status="archived" /> : c.lifecycle === "active" ? <Badge tone="info">{t(c.stage)}</Badge> : <StatusBadge status={c.lifecycle} />}
            <PriorityBadge priority={c.priority} />
            {c.lifecycle === "active" && u === "overdue" && <Badge tone="danger" icon={<TriangleAlert />}>{fmt.due(c.due_date, data.today)}</Badge>}
            {c.lifecycle === "active" && u === "due_soon" && <Badge tone="warn" icon={<CalendarClock />}>{fmt.due(c.due_date, data.today)}</Badge>}
          </div>
          <p className="mt-1.5 text-[14px] text-muted">
            {t("{0} for {1}", { 0: t(c.service ?? c.category), 1: c.patient_reference ?? t("a patient") })} · {c.clinic}{c.dentist ? `, ${c.dentist}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.tray_number ? (
            <button onClick={() => setDialog("release")} className="flex items-center gap-2 rounded-lg border border-occupied/30 bg-occupied-soft px-3 py-1.5 text-[13px] font-semibold text-occupied hover:brightness-95">
              <Grid3x3 className="size-4" /> {t("Tray")} {trayCode(c.tray_number)}
            </button>
          ) : (c.lifecycle === "active" || c.lifecycle === "completed") && !c.archived_at ? (
            <Button variant="secondary" onClick={() => setDialog("tray")}><Grid3x3 /> {t("Place in tray")}</Button>
          ) : null}
          {perms.canMoveStage && next && !c.archived_at && c.lifecycle !== "cancelled" && (
            <Button onClick={advance} loading={busy}>
              {next.system_key === "completed" ? <Check /> : next.system_key === "delivered" ? <PackageOpen /> : <ChevronRight />}
              {next.system_key === "completed" ? t("Mark completed") : next.system_key === "delivered" ? t("Mark delivered") : t("Move to {0}", { 0: t(next.name) })}
            </Button>
          )}
          {(canEdit || perms.isAdmin) && (
            <Menu>
              <MenuTrigger asChild><Button variant="secondary" size="icon" aria-label={t("More actions")}><MoreHorizontal /></Button></MenuTrigger>
              <MenuContent>
                {canEdit && !c.archived_at && <MenuItem onSelect={() => setDialog("edit")}><Pencil /> {t("Edit details")}</MenuItem>}
                <MenuItem onSelect={() => onTab("workflow")}><ChevronRight /> {t("Change stage")}</MenuItem>
                {perms.isAdmin && (
                  <>
                    <MenuSeparator />
                    {c.archived_at ? (
                      <MenuItem onSelect={() => simple(() => restoreCaseAction(c.id))}><ArchiveRestore /> {t("Restore from archive")}</MenuItem>
                    ) : (c.lifecycle === "delivered" || c.lifecycle === "cancelled") ? (
                      <MenuItem onSelect={() => simple(() => archiveCaseAction(c.id))} disabled={!!c.tray_id}><Archive /> {t("Archive case")}</MenuItem>
                    ) : null}
                    {(c.lifecycle === "active" || c.lifecycle === "completed") && !c.archived_at && (
                      <MenuItem destructive onSelect={() => setDialog("cancel")}><Ban /> {t("Cancel case")}</MenuItem>
                    )}
                  </>
                )}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>
      {c.tray_id && c.lifecycle !== "active" && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ink">
          <span>{t("This case is {0}, but tray {1} is still marked occupied. Release it once the work has been removed.", { 0: t(c.lifecycle), 1: trayCode(c.tray_number!) })}</span>
          <Button size="sm" onClick={() => setDialog("release")}><PackageOpen /> {t("Release tray")}</Button>
        </motion.div>
      )}
      <EditDialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)} data={data} />
      <CancelDialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)} data={data} />
      <CaseReleaseDialog open={dialog === "release"} onOpenChange={(o) => !o && setDialog(null)} data={data} />
      <PlaceTrayDialog open={dialog === "tray"} onOpenChange={(o) => !o && setDialog(null)} data={data} />
    </>
  );
}

function PlaceTrayDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: CaseData }) {
  const { t } = useI18n();
  const router = useRouter();
  const [tray, setTray] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    setBusy(true);
    const r = await assignCaseTrayAction(data.c.id, tray);
    setBusy(false);
    if (r.ok) { toast.success(t("Placed in tray {0}", { 0: trayCode(data.options.trays.find((item) => item.id === tray)!.number) })); onOpenChange(false); router.refresh(); } else toast.error(r.error);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={t("Place {0} in a tray", { 0: data.c.reference })}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} disabled={!tray} loading={busy}>{t("Place case")}</Button></>}>
      <Field label="Available tray" htmlFor="pt">
        <Select id="pt" value={tray} onChange={(e) => setTray(e.target.value)}>
          <option value="">{t("Choose a tray")}</option>
          {data.options.trays.map((item) => <option key={item.id} value={item.id}>{trayCode(item.number)}{item.label ? ` — ${item.label}` : ""}</option>)}
        </Select>
      </Field>
      {data.options.trays.length === 0 && <p className="mt-2 text-xs text-danger">{t("No trays are available. Release a finished tray first.")}</p>}
    </Dialog>
  );
}

function CaseReleaseDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: CaseData }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [ok, setOk] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { c } = data;
  React.useEffect(() => { if (open) { setOk(false); setReason(""); } }, [open]);
  if (!c.tray_id) return null;
  const active = c.lifecycle === "active";
  async function submit() {
    setBusy(true);
    const r = await releaseTrayAction(c.tray_id!, ok, reason);
    setBusy(false);
    if (r.ok) { toast.success(t("Tray {0} is available", { 0: trayCode(c.tray_number!) })); onOpenChange(false); router.refresh(); } else toast.error(r.error);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={t("Tray {0}", { 0: trayCode(c.tray_number!) })}
      description={t("In this tray since {0}.", { 0: fmt.dateTime(c.tray_assigned_at, data.timezone) })}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Close")}</Button><Button onClick={submit} disabled={!ok || (active && !reason.trim())} loading={busy}>{t("Release tray")}</Button></>}>
      <div className="mx-auto mb-4 max-w-[220px]"><TrayVisual number={c.tray_number!} state="occupied" idSuffix="-case" /></div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:bg-surface-2">
        <Checkbox checked={ok} onCheckedChange={(v) => setOk(v === true)} className="mt-0.5" aria-label={t("Tray is empty")} />
        <span className="text-[13px]">{t("I've checked tray {0} and both compartments are physically empty.", { 0: trayCode(c.tray_number!) })}</span>
      </label>
      {active && (
        <Field label="Reason (case is still in production)" htmlFor="rr" className="mt-3" required>
          <Textarea id="rr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. Sent to external milling")} />
        </Field>
      )}
      <p className="mt-3 text-xs text-muted">{t("To move the work to a different tray, use Move on the tray board.")}</p>
    </Dialog>
  );
}

function CancelDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: CaseData }) {
  const { t } = useI18n();
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    setBusy(true);
    const r = await cancelCaseAction(data.c.id, reason);
    setBusy(false);
    if (r.ok) { toast.success("Case cancelled"); onOpenChange(false); router.refresh(); } else toast.error(r.error);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={t("Cancel {0}?", { 0: data.c.reference })}
      description="The case and its cost records are kept. Cancelled cases are excluded from revenue and completion statistics."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Keep case")}</Button><Button variant="danger" onClick={submit} disabled={!reason.trim()} loading={busy}>{t("Cancel case")}</Button></>}>
      <Field label="Reason" htmlFor="cr" required>
        <Textarea id="cr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. Clinic withdrew the order")} />
      </Field>
      {data.c.tray_id && <p className="mt-3 text-xs text-muted">{t("Tray {0} stays occupied until you release it.", { 0: trayCode(data.c.tray_number!) })}</p>}
    </Dialog>
  );
}

function EditDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: CaseData }) {
  const { t } = useI18n();
  const router = useRouter();
  const { c, options: o, perms } = data;
  const admin = perms.isAdmin;
  const init = React.useMemo(() => ({
    reference: c.reference, clinic_id: c.clinic_id, dentist_id: c.dentist_id ?? "", category_id: c.category_id, service_id: c.service_id ?? "",
    technician_id: c.technician_id ?? "", priority: c.priority, units: String(c.units), tooth_numbers: c.tooth_numbers ?? "", shade: c.shade ?? "",
    received_date: c.received_date, due_date: c.due_date, notes: c.notes ?? "",
  }), [c]);
  const [v, setV] = React.useState(init);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setV(init); }, [open, init]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => val !== init[k as keyof typeof init]));
    if (Object.keys(changed).length === 0) { onOpenChange(false); return; }
    setBusy(true);
    const r = await updateCaseAction(c.id, changed);
    setBusy(false);
    if (r.ok) { toast.success("Case updated"); onOpenChange(false); router.refresh(); } else toast.error(r.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={t("Edit {0}", { 0: c.reference })}
      description={admin ? undefined : t("As the assigned technician you can edit shade, tooth numbers and notes.")}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} loading={busy}>{t("Save changes")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {admin && (
          <>
            <Field label="Case reference" htmlFor="e-ref"><Input id="e-ref" value={v.reference} onChange={set("reference")} /></Field>
            <Field label="Priority" htmlFor="e-pri">
              <Select id="e-pri" value={v.priority} onChange={set("priority")}>
                {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p} className="capitalize">{p[0].toUpperCase() + p.slice(1)}</option>)}
              </Select>
            </Field>
            <Field label="Clinic" htmlFor="e-cl">
              <Select id="e-cl" value={v.clinic_id} onChange={(e) => setV((s) => ({ ...s, clinic_id: e.target.value, dentist_id: "" }))}>
                {o.clinics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Dentist" htmlFor="e-de">
              <Select id="e-de" value={v.dentist_id} onChange={set("dentist_id")}>
                <option value="">{t("Not specified")}</option>
                {o.dentists.filter((d) => d.clinic_id === v.clinic_id).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Category" htmlFor="e-cat">
              <Select id="e-cat" value={v.category_id} onChange={(e) => setV((s) => ({ ...s, category_id: e.target.value, service_id: "" }))}>
                {o.categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label="Service" htmlFor="e-sv">
              <Select id="e-sv" value={v.service_id} onChange={set("service_id")}>
                <option value="">{t("Not specified")}</option>
                {o.services.filter((s) => s.category_id === v.category_id).map((s) => <option key={s.id} value={s.id}>{t(s.name)}</option>)}
              </Select>
            </Field>
            <Field label="Technician" htmlFor="e-te" hint="Reassigning notifies the new technician.">
              <Select id="e-te" value={v.technician_id} onChange={set("technician_id")}>
                <option value="">{t("Unassigned")}</option>
                {o.technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Units" htmlFor="e-un"><Input id="e-un" type="number" min={1} max={64} value={v.units} onChange={set("units")} /></Field>
            <Field label="Date received" htmlFor="e-rd"><Input id="e-rd" type="date" value={v.received_date} onChange={set("received_date")} /></Field>
            <Field label="Due date" htmlFor="e-dd"><Input id="e-dd" type="date" value={v.due_date} onChange={set("due_date")} /></Field>
          </>
        )}
        <Field label="Shade" htmlFor="e-sh"><Input id="e-sh" value={v.shade} onChange={set("shade")} /></Field>
        <Field label="Tooth numbers" htmlFor="e-tn"><Input id="e-tn" value={v.tooth_numbers} onChange={set("tooth_numbers")} /></Field>
        <Field label="Case notes" htmlFor="e-no" className="sm:col-span-2"><Textarea id="e-no" rows={4} value={v.notes} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────
function DL({ items }: { items: Array<[string, React.ReactNode]> }) {
  const { t } = useI18n();
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted">{t(k)}</dt>
          <dd className="mt-0.5 text-[13.5px] font-medium text-ink">{v ?? <span className="font-normal text-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function OverviewTab({ data }: { data: CaseData }) {
  const { fmt, t } = useI18n();
  const { c } = data;
  const b = data.costs ? costBreakdown(data.costs.summary) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">{t("Case details")}</h2>
          <DL items={[
            ["Patient", c.patient_reference ? <Link href={`/patients/${c.patient_id}`} className="hover:text-primary">{c.patient_reference}{c.patient_name ? ` · ${c.patient_name}` : ""}</Link> : t("Restricted")],
            ["Dental clinic", <Link key="c" href={`/clinics/${c.clinic_id}`} className="hover:text-primary">{c.clinic}</Link>],
            ["Dentist", c.dentist],
            ["Prosthetic category", t(c.category)],
            ["Service", c.service ? t(c.service) : null],
            ["Units", c.units],
            ["Tooth numbers", c.tooth_numbers],
            ["Shade", c.shade],
          ]} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">{t("Production")}</h2>
          <DL items={[
            ["Stage", t(c.stage)],
            ["Technician", c.technician ?? <span className="text-warn">{t("Unassigned")}</span>],
            ["Date received", fmt.day(c.received_date)],
            ["Due date", <span key="d">{fmt.day(c.due_date)}{c.lifecycle === "active" && <span className="ml-2 text-xs font-normal text-muted">{fmt.due(c.due_date, data.today)}</span>}</span>],
            ["Completed", c.completed_at ? fmt.dateTime(c.completed_at, data.timezone) : null],
            ["Delivered", c.delivered_at ? fmt.dateTime(c.delivered_at, data.timezone) : null],
          ]} />
        </Card>
        {c.notes && (
          <Card className="p-5">
            <h2 className="mb-2 text-[15px] font-semibold">{t("Case notes")}</h2>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{c.notes}</p>
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{t("Tray")}</h2>
          {c.tray_number ? (
            <>
              <div className="mx-auto max-w-[240px]"><TrayVisual number={c.tray_number} state="occupied" idSuffix="-ov" /></div>
              <p className="mt-3 text-center text-[13px] text-muted">{t("In tray {0} since {1}", { 0: trayCode(c.tray_number), 1: fmt.dateTime(c.tray_assigned_at, data.timezone) })}</p>
            </>
          ) : (
            <p className="text-[13px] text-muted">{t("Not in a tray.")}</p>
          )}
          {data.trayHistory.filter((item) => item.released_at).length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-1.5 text-xs text-muted">{t("Previous trays")}</p>
              <ul className="space-y-1 text-[13px]">
                {data.trayHistory.filter((item) => item.released_at).map((item) => (
                  <li key={item.id} className="flex justify-between gap-2"><span className="font-medium tabular">{trayCode(item.number)}</span><span className="text-xs text-muted">{t("released {0}", { 0: fmt.dateTime(item.released_at, data.timezone) })}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        {b && (
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold">{t("Recorded direct cost")}</h2>
            <p className="text-[22px] font-semibold tabular">{fmt.money(b.total, data.currency)}</p>
            <p className="mt-1 text-xs text-muted">{b.complete ? t("All cost sections confirmed.") : t("Cost record incomplete — see Cost breakdown.")}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────
function WorkflowTab({ data }: { data: CaseData }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const { c, perms } = data;
  const stages = data.options.stages;
  const currentIdx = stages.findIndex((s) => s.id === c.stage_id);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const reachedAt = (stageId: string) => [...data.history].reverse().find((h) => h.to_stage_id === stageId);
  const locked = !!c.archived_at || c.lifecycle === "cancelled" || !perms.canMoveStage;

  async function move(stageId: string, name: string) {
    setBusy(stageId);
    const r = await moveStageAction(c.id, stageId, note);
    setBusy(null);
    if (r.ok) { toast.success(t("{0} moved to {1}", { 0: c.reference, 1: t(name) })); setNote(""); router.refresh(); } else toast.error(r.error);
  }

  const progress = stages.length > 1 ? (currentIdx / (stages.length - 1)) * 100 : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold">{t("Production workflow")}</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {c.lifecycle === "cancelled" ? t("This case was cancelled.") : locked && !perms.canMoveStage ? t("Only the assigned technician or an administrator can change the stage.") : t("Select a stage to move the case. Every change is time-stamped.")}
        </p>
        <ol className="relative mt-6">
          <div className="absolute bottom-5 left-[15px] top-5 w-0.5 rounded-full bg-line" aria-hidden>
            <motion.div
              className="w-full rounded-full bg-primary"
              initial={false}
              animate={{ height: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
            />
          </div>
          {stages.map((s, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            const at = reachedAt(s.id);
            return (
              <li key={s.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
                <motion.span
                  layout
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-300",
                    done && "border-primary bg-primary text-primary-fg",
                    current && "border-primary bg-surface text-primary ring-4 ring-primary/15",
                    !done && !current && "border-line bg-surface text-muted",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </motion.span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 pt-1">
                  <div>
                    <p className={cn("text-[14px] font-semibold", current ? "text-ink" : done ? "text-ink-2" : "text-muted")}>
                      {t(s.name)} {current && <span className="ml-1 text-xs font-medium text-primary">{t("Current")}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {at ? `${fmt.dateTime(at.changed_at, data.timezone)}${at.actor ? ` · ${at.actor}` : ""}` : done ? t("Skipped") : t("Not reached")}
                    </p>
                    {at?.note && <p className="mt-1 text-xs italic text-ink-2">“{at.note}”</p>}
                  </div>
                  {!locked && !current && (
                    <Button variant={i === currentIdx + 1 ? "primary" : "ghost"} size="sm" loading={busy === s.id} disabled={busy !== null} onClick={() => move(s.id, s.name)}>
                      {i < currentIdx ? t("Move back") : t("Move here")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!locked && (
          <Field label="Note for the next stage change" htmlFor="stage-note" className="mt-6" hint="Optional, saved with the change.">
            <Input id="stage-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. Shade adjusted after try-in")} maxLength={300} />
          </Field>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("Stage history")}</h2>
        <ol className="mt-3 space-y-3">
          {[...data.history].reverse().map((h) => (
            <li key={h.id} className="text-[13px]">
              <p className="text-ink">{h.from_stage ? <>{t(h.from_stage)} → <span className="font-semibold">{t(h.to_stage)}</span></> : <span className="font-semibold">{t(h.to_stage)}</span>}</p>
              <p className="text-xs text-muted">{fmt.dateTime(h.changed_at, data.timezone)}{h.actor ? ` · ${h.actor}` : ""}</p>
            </li>
          ))}
        </ol>
        {c.lifecycle !== "active" && c.completed_at && (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            {t("Production time: {0} calendar days from receipt to completion.", { 0: Math.max(0, Math.round((new Date(c.completed_at).getTime() - new Date(`${c.received_date}T00:00:00`).getTime()) / 864e5)) })}
          </p>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pricing & invoicing (administrators)
// ─────────────────────────────────────────────────────────────
function PricingTab({ data }: { data: CaseData }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const f = data.finance!;
  const invoiced = f.billing.length > 0;
  const [v, setV] = React.useState({ selling_price: f.selling_price ?? "", discount: f.discount_amount === "0.00" ? "" : f.discount_amount, estimated: f.estimated_direct_cost ?? "" });
  const [busy, setBusy] = React.useState<"save" | "invoice" | null>(null);
  const b = costBreakdown(data.costs!.summary);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    const r = await updatePricingAction(data.c.id, v);
    setBusy(null);
    if (r.ok) { toast.success("Pricing saved"); router.refresh(); } else toast.error(r.error);
  }
  async function invoice() {
    setBusy("invoice");
    const r = await createInvoiceAction({ clinic_id: data.c.clinic_id, case_ids: [data.c.id], issue: true });
    setBusy(null);
    if (r.ok) { toast.success("Invoice issued"); router.refresh(); } else toast.error(r.error);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">{t("Pricing")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {f.price_source === "price_list" ? t("Taken from the price list when the case was created.") : f.price_source === "manual" ? t("Set manually.") : t("No price set yet.")} {t("Later price-list changes don't affect this case.")}
          </p>
          <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={t("Selling price ({0})", { 0: data.currency })} htmlFor="p-sp"><Input id="p-sp" inputMode="decimal" value={v.selling_price} onChange={(e) => setV({ ...v, selling_price: e.target.value })} disabled={invoiced} /></Field>
            <Field label={t("Discount ({0})", { 0: data.currency })} htmlFor="p-di"><Input id="p-di" inputMode="decimal" value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} placeholder="0.00" disabled={invoiced} /></Field>
            <Field label={t("Estimated cost ({0})", { 0: data.currency })} htmlFor="p-es" hint="Planning only."><Input id="p-es" inputMode="decimal" value={v.estimated} onChange={(e) => setV({ ...v, estimated: e.target.value })} /></Field>
            <div className="flex items-center gap-3 sm:col-span-3">
              <Button type="submit" variant="secondary" loading={busy === "save"}>{t("Save pricing")}</Button>
              {invoiced && <span className="text-xs text-muted">{t("Price is locked because the case is invoiced. Use a credit note to adjust.")}</span>}
            </div>
          </form>
        </Card>
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">{t("Invoices")}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{t("Billing is separate from payment: an issued invoice is a receivable until the clinic pays.")}</p>
            </div>
            {!invoiced && data.c.lifecycle !== "cancelled" && (
              <Button onClick={invoice} loading={busy === "invoice"} disabled={!f.selling_price}><Receipt /> {t("Issue invoice for this case")}</Button>
            )}
          </div>
          {invoiced ? (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {f.billing.map((bi) => (
                <li key={bi.invoice_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                  <Link href={`/finance/invoices/${bi.invoice_id}`} className="font-semibold hover:text-primary">{bi.number}</Link>
                  <span className="text-muted">{fmt.day(bi.issue_date)}</span>
                  <span className="tabular">{fmt.money(bi.line_amount, data.currency)}{bi.lines_on_invoice > 1 && <span className="text-muted"> {t("of {0}", { 0: fmt.money(bi.invoice_total, data.currency) })}</span>}</span>
                  <StatusBadge status={bi.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-muted">{f.selling_price ? t("Not invoiced yet. You can also bill several cases together from Finance.") : t("Set a selling price before invoicing.")}</p>
          )}
        </Card>
      </div>
      <FinancialSummaryCard data={data} b={b} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Notes & files
// ─────────────────────────────────────────────────────────────
function NotesFilesTab({ data }: { data: CaseData }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addNoteAction(data.c.id, body);
    setBusy(false);
    if (r.ok) { setBody(""); router.refresh(); } else toast.error(r.error);
  }
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error("Files must be 10 MB or smaller."); return; }
    const fd = new FormData();
    fd.set("file", file);
    setUploading(true);
    const r = await uploadFileAction(data.c.id, fd);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.ok) { toast.success(t("{0} uploaded", { 0: file.name })); router.refresh(); } else toast.error(r.error);
  }
  async function del(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const r = await fn();
    if (r.ok) router.refresh(); else toast.error(r.error);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("Notes")}</h2>
        <form onSubmit={addNote} className="mt-3">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("Add a note for the team…")} rows={3} aria-label={t("New note")} maxLength={4000} />
          <div className="mt-2 flex justify-end"><Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>{t("Add note")}</Button></div>
        </form>
        <ol className="mt-4 space-y-3">
          {data.notes.length === 0 && <li className="text-[13px] text-muted">{t("No notes yet.")}</li>}
          {data.notes.map((n) => (
            <motion.li key={n.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="group rounded-lg border border-line px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted"><span className="font-medium text-ink-2">{n.author ?? t("Unknown")}</span> · {fmt.relative(n.created_at)}</p>
                {(n.author_id === data.perms.userId || data.perms.isAdmin) && (
                  <button onClick={() => del(() => deleteNoteAction(n.id))} className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={t("Delete note")}><Trash2 className="size-3.5" /></button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{n.body}</p>
            </motion.li>
          ))}
        </ol>
      </Card>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{t("Files")}</h2>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}><Upload /> {t("Upload")}</Button>
          <input ref={fileRef} type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label={t("Upload file")} />
        </div>
        <p className="mt-0.5 text-xs text-muted">{t("Scans, photos, prescriptions. Up to 10 MB each.")}</p>
        <ul className="mt-4 space-y-2">
          {data.files.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-muted">{t("No files yet.")}</li>}
          {data.files.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
              <FileText className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{f.file_name}</p>
                <p className="text-[11px] text-muted">{(f.size_bytes / 1024).toFixed(f.size_bytes < 102400 ? 1 : 0)} KB · {f.uploader ?? t("Unknown")} · {fmt.relative(f.created_at)}</p>
              </div>
              <a href={`/api/files/${f.id}`} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t("Download {0}", { 0: f.file_name })}><Download className="size-4" /></a>
              {(f.uploaded_by === data.perms.userId || data.perms.isAdmin) && (
                <button onClick={() => del(() => deleteFileAction(f.id))} className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label={t("Delete {0}", { 0: f.file_name })}><Trash2 className="size-4" /></button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ActivityTab({ data }: { data: CaseData }) {
  const { fmt, t } = useI18n();
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">{t("Activity history")}</h2>
      <ol className="relative mt-4 space-y-1 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
        {data.activity.map((a) => (
          <li key={a.id} className="relative flex gap-4 py-1.5 pl-0">
            <span className="relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-primary bg-surface" aria-hidden />
            <div>
              <p className="text-[13px] text-ink">{a.summary}</p>
              <p className="text-[11px] text-muted">{a.actor ?? t("System")} · {fmt.dateTime(a.created_at, data.timezone)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
