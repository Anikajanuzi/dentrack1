"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import { Building2, Plus, User } from "lucide-react";
import type { listClinics } from "@/lib/data/directory";
import { saveClinicAction } from "@/lib/actions/directory";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Data = Awaited<ReturnType<typeof listClinics>>;

export function DirectoryView({ data }: { data: Data }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = React.useState(sp.get("tab") === "patients" ? "patients" : "clinics");
  const [adding, setAdding] = React.useState(false);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TabsList id="dir" value={tab} items={[
          { value: "clinics", label: t("Clinics ({0})", { 0: data.clinics.length }) },
          { value: "patients", label: t("Patients ({0})", { 0: data.patients.length }) },
        ]} className="flex-1" />
      </div>
      <div className="pt-5">
        <TabsContent value="clinics">
          <DataTable
            rows={data.clinics}
            search={(c) => `${c.name} ${c.email ?? ""} ${(c.dentists ?? []).join(" ")}`}
            searchPlaceholder="Search clinics or dentists"
            onRowClick={(c) => router.push(`/clinics/${c.id}`)}
            initialSort={{ key: "name", dir: "asc" }}
            toolbar={data.isAdmin ? <Button size="sm" onClick={() => setAdding(true)}><Plus /> {t("Add clinic")}</Button> : undefined}
            empty={{ title: "No clinics yet", icon: <Building2 />, body: data.isAdmin ? "Add the dental practices that send you work. You choose a clinic every time you create a case." : "An administrator adds clinics." }}
            columns={[
              { key: "name", header: "Clinic", sort: (c) => c.name, render: (c) => <Link href={`/clinics/${c.id}`} className="font-semibold text-ink hover:text-primary" onClick={(e) => e.stopPropagation()}>{c.name}{!c.is_active && <Badge tone="neutral" className="ml-2">{t("Inactive")}</Badge>}</Link> },
              { key: "dentists", header: "Dentists", render: (c) => <span className="text-ink-2">{c.dentists?.join(", ") ?? "—"}</span> },
              { key: "contact", header: "Contact", render: (c) => <span className="text-ink-2">{c.email ?? c.phone ?? "—"}</span> },
              { key: "active", header: "Active cases", align: "right", sort: (c) => c.active_cases, render: (c) => c.active_cases },
              { key: "completed", header: "Completed", align: "right", sort: (c) => c.completed_cases, render: (c) => c.completed_cases },
              ...(data.isAdmin ? [{ key: "out", header: "Outstanding", align: "right" as const, sort: (c: Data["clinics"][number]) => Number(c.outstanding ?? 0), render: (c: Data["clinics"][number]) => <span className={Number(c.outstanding) > 0 ? "font-medium text-ink" : "text-muted"}>{fmt.money(c.outstanding, data.currency)}</span> }] : []),
            ]}
          />
        </TabsContent>
        <TabsContent value="patients">
          <DataTable
            rows={data.patients}
            search={(p) => `${p.reference} ${p.full_name ?? ""} ${p.clinic ?? ""}`}
            searchPlaceholder="Search patient reference or name"
            onRowClick={(p) => router.push(`/patients/${p.id}`)}
            initialSort={{ key: "ref", dir: "asc" }}
            empty={{ title: "No patients yet", icon: <User />, body: "You don't add patients here: a patient record is created automatically with their first case." }}
            columns={[
              { key: "ref", header: "Reference", sort: (p) => p.reference, render: (p) => <Link href={`/patients/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink hover:text-primary">{p.reference}</Link> },
              { key: "name", header: "Name", sort: (p) => p.full_name ?? "", render: (p) => <span className="text-ink-2">{p.full_name ?? "—"}</span> },
              { key: "clinic", header: "Clinic", sort: (p) => p.clinic ?? "", render: (p) => <span className="text-ink-2">{p.clinic ?? "—"}</span> },
              { key: "active", header: "Active cases", align: "right", sort: (p) => p.active_cases, render: (p) => p.active_cases },
              { key: "total", header: "All cases", align: "right", sort: (p) => p.total_cases, render: (p) => p.total_cases },
              { key: "last", header: "Last received", align: "right", sort: (p) => p.last_received ?? "", render: (p) => <span className="text-ink-2">{fmt.day(p.last_received)}</span> },
            ]}
          />
          {!data.isAdmin && <p className="mt-3 text-xs text-muted">{t("You see patients of cases assigned to you.")}</p>}
        </TabsContent>
      </div>
      <ClinicDialog open={adding} onOpenChange={setAdding} onSaved={(id) => router.push(`/clinics/${id}`)} />
    </Tabs>
  );
}

export function ClinicDialog({ open, onOpenChange, clinic, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (id: string) => void;
  clinic?: { id: string; name: string; email: string | null; phone: string | null; address: string | null; notes: string | null };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const init = { name: clinic?.name ?? "", email: clinic?.email ?? "", phone: clinic?.phone ?? "", address: clinic?.address ?? "", notes: clinic?.notes ?? "" };
  const [v, setV] = React.useState(init);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (open) { setV(init); setErrors({}); } }, [open]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    setBusy(true);
    const r = await saveClinicAction(clinic?.id ?? null, v);
    setBusy(false);
    if (r.ok) { toast.success(r.message); onOpenChange(false); onSaved?.(r.data!); router.refresh(); }
    else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={clinic ? t("Edit clinic") : t("Add clinic")}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} loading={busy}>{clinic ? t("Save clinic") : t("Add clinic")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinic name" htmlFor="c-name" error={errors.name} className="sm:col-span-2" required><Input id="c-name" value={v.name} onChange={set("name")} autoFocus /></Field>
        <Field label="Email" htmlFor="c-email" error={errors.email}><Input id="c-email" type="email" value={v.email} onChange={set("email")} /></Field>
        <Field label="Phone" htmlFor="c-phone"><Input id="c-phone" value={v.phone} onChange={set("phone")} /></Field>
        <Field label="Address" htmlFor="c-addr" className="sm:col-span-2"><Input id="c-addr" value={v.address} onChange={set("address")} /></Field>
        <Field label="Notes" htmlFor="c-notes" className="sm:col-span-2"><Textarea id="c-notes" value={v.notes} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}
