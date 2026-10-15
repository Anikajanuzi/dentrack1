"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ArrowLeft } from "lucide-react";
import type { getPatient } from "@/lib/data/directory";
import { updatePatientAction } from "@/lib/actions/directory";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";

type Data = Awaited<ReturnType<typeof getPatient>>;

export function PatientDetail({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const p = d.patient;
  const [v, setV] = React.useState({ full_name: p.full_name ?? "", notes: p.notes ?? "", clinic_id: p.clinic_id ?? "" });
  const [busy, setBusy] = React.useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await updatePatientAction(p.id, v);
    setBusy(false);
    if (r.ok) { toast.success("Patient saved"); router.refresh(); } else toast.error(r.error);
  }
  const active = d.cases.filter((c) => c.lifecycle === "active").length;
  return (
    <div className="flex flex-col gap-5">
      <Link href="/clinics?tab=patients" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("Patients")}</Link>
      <div>
        <h1 className="type-display">{p.reference}</h1>
        <p className="mt-1 text-[14px] text-muted">{p.full_name ? `${p.full_name} · ` : ""}{p.clinic ?? t("No clinic")} · {t("{0} active, {1} other", { 0: active, 1: d.cases.length - active })}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title={t("Case history")} />
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[520px] text-[13px]">
              <tbody>
                {d.cases.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2"><Link href={`/cases/${c.id}`} className="font-semibold hover:text-primary">{c.reference}</Link></td>
                    <td className="px-3 py-2 text-ink-2">{t(c.service ?? c.category)}</td>
                    <td className="px-3 py-2 text-ink-2">{c.technician ?? t("Unassigned")}</td>
                    <td className="px-3 py-2 text-ink-2 tabular">{t("Received")} {fmt.day(c.received_date, "d MMM yyyy")}</td>
                    <td className="px-3 py-2 text-right"><StatusBadge status={c.archived_at ? "archived" : c.lifecycle} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {d.isAdmin ? (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">{t("Patient record")}</h2>
            <p className="mt-0.5 text-xs text-muted">{t("Store only what the lab needs. The reference alone is usually enough.")}</p>
            <form onSubmit={save} className="mt-4 flex flex-col gap-4">
              <Field label="Name" htmlFor="pn"><Input id="pn" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></Field>
              <Field label="Clinic" htmlFor="pc">
                <Select id="pc" value={v.clinic_id} onChange={(e) => setV({ ...v, clinic_id: e.target.value })}>
                  <option value="">{t("None")}</option>
                  {d.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="pno"><Textarea id="pno" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
              <Button type="submit" variant="secondary" loading={busy} className="self-start">{t("Save patient")}</Button>
            </form>
          </Card>
        ) : (
          <Card className="p-5 text-[13px] text-muted">{t("You can see this patient because they have a case assigned to you.")}</Card>
        )}
      </div>
    </div>
  );
}
