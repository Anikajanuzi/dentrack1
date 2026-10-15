"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Plus, Trash2, Power } from "lucide-react";
import type { getClinic } from "@/lib/data/directory";
import { addDentistAction, removeDentistAction, setClinicActiveAction } from "@/lib/actions/directory";
import { ClinicDialog } from "./directory-view";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { sum } from "@/lib/finance";

type Data = Awaited<ReturnType<typeof getClinic>>;

export function ClinicDetail({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [dentist, setDentist] = React.useState({ full_name: "", email: "" });
  const [busy, setBusy] = React.useState(false);
  const cl = d.clinic;
  const outstanding = sum(d.invoices.filter((i) => i.payment_status !== "void").map((i) => i.outstanding));
  const unapplied = sum(d.payments.map((p) => p.unapplied));

  async function addDentist(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addDentistAction(cl.id, dentist);
    setBusy(false);
    if (r.ok) { setDentist({ full_name: "", email: "" }); router.refresh(); } else toast.error(r.fieldErrors?.full_name ?? r.error);
  }
  async function act(p: Promise<{ ok: boolean; error?: string; message?: string }>) {
    const r = await p;
    if (r.ok) { if (r.message) toast.success(r.message); router.refresh(); } else toast.error(r.error);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/clinics" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("Clinics")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-display flex items-center gap-3">{cl.name}{!cl.is_active && <Badge tone="neutral">{t("Inactive")}</Badge>}</h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
            {cl.email && <a href={`mailto:${cl.email}`} className="flex items-center gap-1.5 hover:text-ink"><Mail className="size-3.5" />{cl.email}</a>}
            {cl.phone && <a href={`tel:${cl.phone}`} className="flex items-center gap-1.5 hover:text-ink"><Phone className="size-3.5" />{cl.phone}</a>}
            {cl.address && <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{cl.address}</span>}
          </div>
        </div>
        {d.isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEdit(true)}><Pencil /> {t("Edit")}</Button>
            <Button variant="ghost" onClick={() => act(setClinicActiveAction(cl.id, !cl.is_active))}><Power /> {cl.is_active ? t("Deactivate") : t("Reactivate")}</Button>
          </div>
        )}
      </div>

      {d.isAdmin && (
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            ["Active cases", d.cases.filter((c) => c.lifecycle === "active").length],
            ["Completed or delivered", d.cases.filter((c) => c.lifecycle === "completed" || c.lifecycle === "delivered").length],
            ["Outstanding balance", fmt.money(outstanding, d.currency)],
            ["Unapplied payments", fmt.money(unapplied, d.currency)],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-surface px-4 py-3.5">
              <p className="type-label">{t(k as string)}</p>
              <p className="mt-1 text-[20px] font-semibold tabular">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title={t("Cases")} description="Most recent first" />
          <div className="overflow-x-auto p-2">
            {d.cases.length === 0 ? <p className="px-3 py-6 text-[13px] text-muted">{t("No cases from this clinic yet.")}</p> : (
              <table className="w-full min-w-[480px] text-[13px]">
                <tbody>
                  {d.cases.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2"><Link href={`/cases/${c.id}`} className="font-semibold hover:text-primary">{c.reference}</Link></td>
                      <td className="px-3 py-2 text-ink-2">{c.patient ?? t("Restricted")}</td>
                      <td className="px-3 py-2 text-ink-2">{t(c.category)}</td>
                      <td className="px-3 py-2 text-ink-2 tabular">{fmt.day(c.due_date, "d MMM yyyy")}</td>
                      <td className="px-3 py-2 text-right"><StatusBadge status={c.archived_at ? "archived" : c.lifecycle} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t("Dentists")} />
            <ul className="px-5 pt-3">
              {d.dentists.length === 0 && <li className="pb-2 text-[13px] text-muted">{t("No dentists recorded.")}</li>}
              {d.dentists.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
                  <span><span className="font-medium">{x.full_name}</span>{x.email && <span className="ml-2 text-muted">{x.email}</span>}</span>
                  {d.isAdmin && <button onClick={() => act(removeDentistAction(x.id))} className="rounded p-1 text-muted hover:text-danger" aria-label={t("Remove {0}", { 0: x.full_name })}><Trash2 className="size-3.5" /></button>}
                </li>
              ))}
            </ul>
            {d.isAdmin && (
              <form onSubmit={addDentist} className="flex flex-wrap gap-2 p-5 pt-3">
                <Input value={dentist.full_name} onChange={(e) => setDentist({ ...dentist, full_name: e.target.value })} placeholder={t("Dentist name")} aria-label={t("Dentist name")} className="min-w-40 flex-1" />
                <Input value={dentist.email} onChange={(e) => setDentist({ ...dentist, email: e.target.value })} placeholder={t("Email (optional)")} aria-label={t("Dentist email")} className="min-w-40 flex-1" />
                <Button type="submit" variant="secondary" loading={busy}><Plus /> {t("Add")}</Button>
              </form>
            )}
          </Card>
          {d.isAdmin && (
            <Card>
              <CardHeader title={t("Invoices")} action={<Link href={`/finance?clinic=${cl.id}`} className="text-[13px] font-medium text-primary hover:underline">{t("Finance")}</Link>} />
              <ul className="px-5 py-3">
                {d.invoices.length === 0 && <li className="text-[13px] text-muted">{t("No invoices yet.")}</li>}
                {d.invoices.slice(0, 12).map((i) => (
                  <li key={i.invoice_id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
                    <Link href={`/finance/invoices/${i.invoice_id}`} className="font-medium hover:text-primary">{i.number}</Link>
                    <span className="text-muted tabular">{fmt.day(i.issue_date, "d MMM yy")}</span>
                    <span className="tabular">{fmt.money(i.total, d.currency)}</span>
                    <StatusBadge status={i.payment_status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {cl.notes && <Card className="p-5"><h2 className="mb-1 text-[15px] font-semibold">{t("Notes")}</h2><p className="whitespace-pre-wrap text-[13px] text-ink-2">{cl.notes}</p></Card>}
        </div>
      </div>
      <ClinicDialog open={edit} onOpenChange={setEdit} clinic={cl} />
    </div>
  );
}
