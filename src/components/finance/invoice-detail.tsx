"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ArrowLeft, Ban, Printer, Send, Wallet, BadgeMinus } from "lucide-react";
import type { getInvoice } from "@/lib/data/finance";
import { addCreditNoteAction, allocatePaymentAction, issueInvoiceAction, voidInvoiceAction } from "@/lib/actions/finance";
import { PaymentDialog } from "./finance-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { D } from "@/lib/finance";

type Data = Awaited<ReturnType<typeof getInvoice>>;

export function InvoiceDetail({ d }: { d: Data }) {
  const { fmt, t, tn } = useI18n();
  const router = useRouter();
  const { inv } = d;
  const cur = d.lab.currency;
  const [dialog, setDialog] = React.useState<null | "pay" | "credit" | "void">(null);
  const [credit, setCredit] = React.useState({ amount: "", reason: "" });
  const [voidReason, setVoidReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function act(p: Promise<{ ok: boolean; error?: string; message?: string }>, close = true) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) { toast.success(r.message ?? "Saved"); if (close) setDialog(null); router.refresh(); } else toast.error(r.error);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/finance" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-ink print:hidden"><ArrowLeft className="size-4" /> {t("Finance")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3"><h1 className="type-display">{inv.number}</h1><StatusBadge status={inv.payment_status} /></div>
        <div className="flex flex-wrap gap-2">
          {inv.status === "draft" && <Button onClick={() => act(issueInvoiceAction(inv.invoice_id))} loading={busy}><Send /> {t("Issue invoice")}</Button>}
          {inv.status === "issued" && D(inv.outstanding).gt(0) && <Button onClick={() => setDialog("pay")}><Wallet /> {t("Record payment")}</Button>}
          {inv.status === "issued" && D(inv.outstanding).gt(0) && <Button variant="secondary" onClick={() => setDialog("credit")}><BadgeMinus /> {t("Credit note")}</Button>}
          <Button variant="secondary" onClick={() => window.print()}><Printer /> {t("Print")}</Button>
          {inv.status !== "void" && D(inv.paid).isZero() && D(inv.credited).isZero() && <Button variant="danger-ghost" onClick={() => setDialog("void")}><Ban /> {t("Void")}</Button>}
        </div>
      </div>

      {d.unapplied.length > 0 && inv.status === "issued" && D(inv.outstanding).gt(0) && (
        <Card className="flex flex-wrap items-center gap-3 border-warn/30 bg-warn-soft px-4 py-3 text-[13px] print:hidden">
          <span className="flex-1">{tn(d.unapplied.length, "{clinic} has {n} unapplied payment.", "{clinic} has {n} unapplied payments.", { clinic: inv.clinic })}</span>
          {d.unapplied.map((p) => {
            const amt = D(p.unapplied).lt(D(inv.outstanding)) ? p.unapplied : inv.outstanding;
            return <Button key={p.id} size="sm" variant="secondary" loading={busy} onClick={() => act(allocatePaymentAction(p.id, inv.invoice_id, amt))}>{t("Apply {0} from {1}", { 0: fmt.money(amt, cur), 1: fmt.day(p.payment_date, "d MMM") })}</Button>;
          })}
        </Card>
      )}

      <Card className="mx-auto w-full max-w-4xl p-6 sm:p-10 print:border-0 print:shadow-none">
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <p className="text-[17px] font-semibold">{d.lab.name}</p>
            <p className="text-[13px] text-muted">{[d.lab.address, d.lab.contact_email, d.lab.phone].filter(Boolean).join(" · ")}</p>
            {d.lab.is_demo && <p className="mt-1 text-xs text-warn">{t("Demo invoice — fictional data")}</p>}
          </div>
          <div className="text-right text-[13px]">
            <p className="text-[22px] font-semibold tracking-tight">{t("Invoice")} {inv.number}</p>
            <p className="text-muted">{t("Issued")} {inv.issue_date ? fmt.day(inv.issue_date) : t("— (draft)")}</p>
            <p className="text-muted">{t("Payment due")} {fmt.day(inv.due_date)}</p>
          </div>
        </div>
        <div className="mt-8 text-[13px]">
          <p className="text-xs text-muted">{t("Billed to")}</p>
          <p className="font-semibold">{inv.clinic}</p>
          {inv.clinic_address && <p className="text-ink-2">{inv.clinic_address}</p>}
          {inv.clinic_email && <p className="text-ink-2">{inv.clinic_email}</p>}
        </div>
        <table className="mt-8 w-full text-[13px]">
          <thead className="border-b border-line-strong text-xs text-muted"><tr><th className="py-2 text-left font-medium">{t("Description")}</th><th className="py-2 text-right font-medium">{t("Qty")}</th><th className="py-2 text-right font-medium">{t("Unit price")}</th><th className="py-2 text-right font-medium">{t("Amount")}</th></tr></thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="py-2.5">{l.case_id ? <Link href={`/cases/${l.case_id}`} className="hover:text-primary print:no-underline">{l.description}</Link> : l.description}{l.voided && <span className="ml-2 text-xs text-muted">{t("(void)")}</span>}</td>
                <td className="py-2.5 text-right tabular">{Number(l.quantity)}</td>
                <td className="py-2.5 text-right tabular">{fmt.money(l.unit_price, cur)}</td>
                <td className="py-2.5 text-right tabular">{fmt.money(l.amount, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 w-full max-w-xs text-[13px]">
          <div className="flex justify-between py-1"><dt className="font-semibold">{t("Total")}</dt><dd className="font-semibold tabular">{fmt.money(inv.total, cur)}</dd></div>
          {d.allocations.map((a) => (
            <div key={a.id} className="flex justify-between py-1 text-ink-2"><dt>{t("Payment {0}", { 0: fmt.day(a.payment_date, "d MMM yyyy") + (a.reference ? ` (${a.reference})` : "") })}</dt><dd className="tabular">− {fmt.money(a.amount, cur)}</dd></div>
          ))}
          {d.credits.map((c) => (
            <div key={c.id} className="flex justify-between py-1 text-ink-2"><dt>{t("Credit {0}: {1}", { 0: fmt.day(c.issue_date, "d MMM yyyy"), 1: c.reason })}</dt><dd className="tabular">− {fmt.money(c.amount, cur)}</dd></div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line-strong py-2 text-[15px]"><dt className="font-semibold">{t("Balance due")}</dt><dd className="font-semibold tabular">{fmt.money(inv.outstanding, cur)}</dd></div>
        </dl>
        {inv.notes && <p className="mt-6 whitespace-pre-wrap text-[13px] text-ink-2">{inv.notes}</p>}
        {inv.status === "void" && <p className="mt-6 text-[13px] font-medium text-danger">{t("This invoice was voided:")} {inv.void_reason}</p>}
      </Card>

      <PaymentDialog
        open={dialog === "pay"}
        onOpenChange={(o) => !o && setDialog(null)}
        d={{ clinics: [{ id: inv.clinic_id, name: inv.clinic }], invoices: [inv], today: d.today, currency: cur }}
        presetClinic={inv.clinic_id}
        presetInvoice={inv.invoice_id}
      />
      <Dialog open={dialog === "credit"} onOpenChange={(o) => !o && setDialog(null)} size="sm" title={t("Issue credit note")}
        description={t("Reduces the balance of {0} without changing the original lines. Outstanding: {1}.", { 0: inv.number, 1: fmt.money(inv.outstanding, cur) })}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button loading={busy} onClick={() => act(addCreditNoteAction(inv.invoice_id, credit.amount, credit.reason))}>{t("Apply credit")}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label={t("Amount ({0})", { 0: cur })} htmlFor="cn-a"><Input id="cn-a" inputMode="decimal" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} /></Field>
          <Field label="Reason" htmlFor="cn-r"><Textarea id="cn-r" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} placeholder={t("e.g. Shade remake goodwill")} /></Field>
        </div>
      </Dialog>
      <Dialog open={dialog === "void"} onOpenChange={(o) => !o && setDialog(null)} size="sm" title={t("Void {0}?", { 0: inv.number })}
        description="The invoice stays on record as void and its cases become billable again."
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>{t("Cancel")}</Button><Button variant="danger" loading={busy} disabled={!voidReason.trim()} onClick={() => act(voidInvoiceAction(inv.invoice_id, voidReason))}>{t("Void invoice")}</Button></>}>
        <Field label="Reason" htmlFor="v-r" required><Textarea id="v-r" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}
