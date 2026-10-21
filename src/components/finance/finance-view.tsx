"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import { Plus, Receipt, Trash2, Wallet, Building } from "lucide-react";
import type { getFinance } from "@/lib/data/finance";
import { addExpenseAction, createInvoiceAction, deleteExpenseAction, newIdempotencyKey, recordPaymentAction } from "@/lib/actions/finance";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { D, money, sum } from "@/lib/finance";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof getFinance>>;

export const EXPENSE_LABELS: Record<string, string> = {
  rent: "Rent", electricity: "Electricity", water: "Water", internet: "Internet & phone", equipment_maintenance: "Equipment maintenance",
  admin_salaries: "Administrative salaries", software: "Software subscriptions", insurance: "Insurance", other: "Other business expense",
};
const METHODS: Record<string, string> = { bank_transfer: "Bank transfer", cash: "Cash", card: "Card", cheque: "Cheque", other: "Other" };

export function FinanceView({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = React.useState(sp.get("tab") ?? "invoices");
  const [dialog, setDialog] = React.useState<null | "invoice" | "payment" | "expense">(null);
  const clinicFilter = sp.get("clinic") ?? "";
  const cur = d.currency;
  const invoices = clinicFilter ? d.invoices.filter((i) => i.clinic_id === clinicFilter) : d.invoices;
  const payments = clinicFilter ? d.payments.filter((p) => p.clinic_id === clinicFilter) : d.payments;
  const open = invoices.filter((i) => i.status === "issued");
  const overdueInv = open.filter((i) => D(i.outstanding).gt(0) && i.due_date && i.due_date < d.today);

  return (
    <div className="flex flex-col gap-5">
      <div data-tour="finance-summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        {[
          ["Outstanding receivables", fmt.money(sum(open.map((i) => i.outstanding)), cur), t("{0} open invoices", { 0: open.filter((i) => D(i.outstanding).gt(0)).length })],
          ["Past due", fmt.money(sum(overdueInv.map((i) => i.outstanding)), cur), t("{0} invoices after their due date", { 0: overdueInv.length })],
          ["Unapplied payments", fmt.money(sum(payments.map((p) => p.unapplied)), cur), "received but not matched to an invoice"],
          ["Completed cases not invoiced", String(d.uninvoiced.filter((c) => !clinicFilter || c.clinic_id === clinicFilter).length), t("{0} still without a price", { 0: d.uninvoiced.filter((c) => !c.net).length })],
        ].map(([k, v, s]) => (
          <div key={k} className="bg-surface px-4 py-4">
            <p className="type-label">{t(k)}</p>
            <p className="mt-1.5 font-display text-[23px] font-semibold tabular">{v}</p>
            <p className="mt-0.5 text-xs text-muted">{t(s)}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <TabsList id="fin" value={tab} items={[{ value: "invoices", label: "Invoices" }, { value: "payments", label: "Payments" }, { value: "expenses", label: "Operating expenses" }]} />
          <div className="flex flex-wrap gap-2 pb-2">
            <Button size="sm" onClick={() => setDialog("invoice")}><Receipt /> {t("New invoice")}</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("payment")}><Wallet /> {t("Record payment")}</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("expense")}><Building /> {t("Add expense")}</Button>
          </div>
        </div>
        {clinicFilter && (
          <p className="mt-3 text-[13px] text-muted">{t("Showing {0}.", { 0: d.clinics.find((c) => c.id === clinicFilter)?.name })} <Link href="/finance" className="text-primary hover:underline">{t("Show all clinics")}</Link></p>
        )}
        <div className="pt-4">
          <TabsContent value="invoices">
            <DataTable
              rows={invoices.map((i) => ({ ...i, id: i.invoice_id }))}
              search={(i) => `${i.number} ${i.clinic}`}
              searchPlaceholder="Search invoice or clinic"
              onRowClick={(i) => router.push(`/finance/invoices/${i.invoice_id}`)}
              initialSort={{ key: "date", dir: "desc" }}
              minWidth={820}
              empty={{ title: "No invoices yet", icon: <Receipt />, body: "An invoice bills a clinic for finished cases. When work is completed, choose New invoice and pick the cases to bill." }}
              columns={[
                { key: "num", header: "Invoice", sort: (i) => i.number, render: (i) => <Link href={`/finance/invoices/${i.invoice_id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-primary">{i.number}</Link> },
                { key: "clinic", header: "Clinic", sort: (i) => i.clinic, render: (i) => <span className="text-ink-2">{i.clinic}</span> },
                { key: "date", header: "Issued", sort: (i) => i.issue_date ?? "9999", render: (i) => <span className="text-ink-2 tabular">{i.issue_date ? fmt.day(i.issue_date, "d MMM yyyy") : t("Draft")}</span> },
                { key: "due", header: "Due", sort: (i) => i.due_date ?? "", render: (i) => <span className={cn("tabular", i.status === "issued" && D(i.outstanding).gt(0) && i.due_date && i.due_date < d.today ? "font-medium text-danger" : "text-ink-2")}>{fmt.day(i.due_date, "d MMM yyyy")}</span> },
                { key: "total", header: "Total", align: "right", sort: (i) => Number(i.total), render: (i) => fmt.money(i.total, cur) },
                { key: "paid", header: "Paid", align: "right", sort: (i) => Number(i.paid), render: (i) => fmt.money(i.paid, cur) },
                { key: "out", header: "Outstanding", align: "right", sort: (i) => Number(i.outstanding), render: (i) => <span className="font-medium">{fmt.money(i.outstanding, cur)}</span> },
                { key: "status", header: "Status", sort: (i) => i.payment_status, render: (i) => <StatusBadge status={i.payment_status} /> },
              ]}
            />
          </TabsContent>
          <TabsContent value="payments">
            <DataTable
              rows={payments}
              search={(p) => `${p.clinic} ${p.reference ?? ""} ${p.invoices ?? ""}`}
              searchPlaceholder="Search payments"
              initialSort={{ key: "date", dir: "desc" }}
              minWidth={760}
              empty={{ title: "No payments recorded", icon: <Wallet />, body: "When a clinic pays, choose Record payment. You can match the money to one or more of their invoices." }}
              columns={[
                { key: "date", header: "Received", sort: (p) => p.payment_date, render: (p) => <span className="tabular">{fmt.day(p.payment_date)}</span> },
                { key: "clinic", header: "Clinic", sort: (p) => p.clinic, render: (p) => <Link href={`/clinics/${p.clinic_id}`} className="hover:text-primary">{p.clinic}</Link> },
                { key: "method", header: "Method", render: (p) => <span className="text-ink-2">{t(METHODS[p.method] ?? p.method)}{p.reference ? ` · ${p.reference}` : ""}</span> },
                { key: "inv", header: "Applied to", render: (p) => <span className="text-ink-2">{p.invoices ?? "—"}</span> },
                { key: "amount", header: "Amount", align: "right", sort: (p) => Number(p.amount), render: (p) => <span className="font-medium">{fmt.money(p.amount, cur)}</span> },
                { key: "un", header: "Unapplied", align: "right", sort: (p) => Number(p.unapplied), render: (p) => D(p.unapplied).gt(0) ? <Badge tone="warn">{fmt.money(p.unapplied, cur)}</Badge> : <span className="text-muted">—</span> },
              ]}
            />
            <p className="mt-2 text-xs text-muted">{t("Payments are permanent records. To correct one, record a credit note on the invoice or contact your accountant.")}</p>
          </TabsContent>
          <TabsContent value="expenses">
            <DataTable
              rows={d.expenses}
              search={(e) => `${e.description} ${EXPENSE_LABELS[e.category]}`}
              searchPlaceholder="Search expenses"
              initialSort={{ key: "date", dir: "desc" }}
              minWidth={700}
              empty={{ title: "No operating expenses recorded", icon: <Building />, body: "Record rent, utilities and other overheads to see operating profit in Analytics." }}
              columns={[
                { key: "date", header: "Date", sort: (e) => e.expense_date, render: (e) => <span className="tabular">{fmt.day(e.expense_date)}</span> },
                { key: "cat", header: "Category", sort: (e) => e.category, render: (e) => t(EXPENSE_LABELS[e.category] ?? e.category) },
                { key: "desc", header: "Description", render: (e) => <span className="text-ink-2">{e.description}</span> },
                { key: "rec", header: "Recurrence", render: (e) => <span className="text-ink-2">{t({ one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" }[e.recurrence] ?? e.recurrence)}</span> },
                { key: "amt", header: "Amount", align: "right", sort: (e) => Number(e.amount), render: (e) => fmt.money(e.amount, cur) },
                { key: "x", header: "", align: "right", render: (e) => <DeleteExpense id={e.id} label={e.description} /> },
              ]}
            />
            <p className="mt-2 text-xs text-muted">{t("Each entry is one dated expense. Recurrence is a label for your reference; enter each month's bill when it arrives. Overheads are never allocated to individual cases.")}</p>
          </TabsContent>
        </div>
      </Tabs>

      <InvoiceDialog open={dialog === "invoice"} onOpenChange={(o) => !o && setDialog(null)} d={d} presetClinic={clinicFilter} />
      <PaymentDialog open={dialog === "payment"} onOpenChange={(o) => !o && setDialog(null)} d={d} presetClinic={clinicFilter} />
      <ExpenseDialog open={dialog === "expense"} onOpenChange={(o) => !o && setDialog(null)} d={d} />
    </div>
  );
}

function DeleteExpense({ id, label }: { id: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <button
      className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
      aria-label={t("Delete {0}", { 0: label })}
      onClick={async () => {
        if (!confirm(t("Delete \"{0}\"?", { 0: label }))) return;
        const r = await deleteExpenseAction(id);
        if (r.ok) { toast.success("Expense deleted"); router.refresh(); } else toast.error(r.error);
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function InvoiceDialog({ open, onOpenChange, d, presetClinic }: { open: boolean; onOpenChange: (o: boolean) => void; d: Data; presetClinic: string }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [clinic, setClinic] = React.useState(presetClinic);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [extra, setExtra] = React.useState<{ description: string; quantity: string; unit_price: string }[]>([]);
  const [issueNow, setIssueNow] = React.useState(true);
  const [issueDate, setIssueDate] = React.useState(d.today);
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setClinic(presetClinic); setSelected([]); setExtra([]); setIssueNow(true); setIssueDate(d.today); setNotes("");
    const due = new Date(`${d.today}T00:00:00Z`); due.setUTCDate(due.getUTCDate() + 30); setDueDate(due.toISOString().slice(0, 10));
  }, [open, presetClinic, d.today]);
  const cases = d.uninvoiced.filter((c) => c.clinic_id === clinic);
  const total = money(
    cases.filter((c) => selected.includes(c.id)).reduce((a, c) => a.plus(D(c.net)), D(0))
      .plus(extra.reduce((a, l) => (/^\d+([.,]\d{1,2})?$/.test(l.unit_price) && /^\d+([.,]\d+)?$/.test(l.quantity) ? a.plus(D(l.unit_price.replace(",", ".")).times(D(l.quantity.replace(",", ".")))) : a), D(0))),
  );

  async function submit() {
    setBusy(true);
    const r = await createInvoiceAction({
      clinic_id: clinic, case_ids: selected, extra_lines: extra.filter((l) => l.description.trim()),
      issue: issueNow, issue_date: issueNow ? issueDate : undefined, due_date: dueDate, notes,
    });
    setBusy(false);
    if (r.ok) { toast.success(r.message); onOpenChange(false); router.push(`/finance/invoices/${r.data}`); router.refresh(); }
    else toast.error(r.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={t("New invoice")}
      description="Each case can be billed once. The case's saved net price becomes the line amount."
      footer={<>
        <span className="mr-auto self-center text-[13px] text-muted">{t("Total")} <span className="font-semibold tabular text-ink">{fmt.money(total, d.currency)}</span></span>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
        <Button onClick={submit} loading={busy} disabled={!clinic || (selected.length === 0 && extra.filter((l) => l.description.trim()).length === 0)}>{issueNow ? t("Issue invoice") : t("Save draft")}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Clinic" htmlFor="inv-clinic" required>
          <Select id="inv-clinic" value={clinic} onChange={(e) => { setClinic(e.target.value); setSelected([]); }}>
            <option value="">{t("Choose a clinic")}</option>
            {d.clinics.map((c) => <option key={c.id} value={c.id}>{t("{0} ({1} to bill)", { 0: c.name, 1: d.uninvoiced.filter((u) => u.clinic_id === c.id).length })}</option>)}
          </Select>
        </Field>
        {clinic && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-2">{t("Completed and delivered cases not yet invoiced")}</p>
              {cases.some((c) => c.net) && <button className="text-xs font-medium text-primary hover:underline" onClick={() => setSelected(cases.filter((c) => c.net).map((c) => c.id))}>{t("Select all priced")}</button>}
            </div>
            {cases.length === 0 ? <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">{t("Nothing to bill for this clinic.")}</p> : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {cases.map((c) => (
                  <li key={c.id}>
                    <label className={cn("flex items-center gap-3 px-3 py-2.5 text-[13px]", c.net ? "cursor-pointer hover:bg-surface-2" : "opacity-60")}>
                      <Checkbox checked={selected.includes(c.id)} disabled={!c.net} onCheckedChange={(v) => setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))} aria-label={c.reference} />
                      <span className="flex-1"><span className="font-medium">{c.reference}</span> <span className="text-muted">· {c.item} · {c.lifecycle === "delivered" ? t("delivered {0}", { 0: fmt.day(c.delivered_at?.slice(0, 10), "d MMM") }) : t("completed, not delivered")}</span></span>
                      <span className="tabular">{c.net ? fmt.money(c.net, d.currency) : <span className="text-warn">{t("No price")}</span>}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-2">{t("Other lines")}</p>
            <Button size="sm" variant="ghost" onClick={() => setExtra((x) => [...x, { description: "", quantity: "1", unit_price: "" }])}><Plus /> {t("Add line")}</Button>
          </div>
          {extra.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_70px_110px_32px] gap-2">
              <Input aria-label={t("Description")} placeholder={t("e.g. Courier delivery")} value={l.description} onChange={(e) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} />
              <Input aria-label={t("Quantity")} inputMode="decimal" value={l.quantity} onChange={(e) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y)))} />
              <Input aria-label={t("Unit price")} inputMode="decimal" placeholder="0.00" value={l.unit_price} onChange={(e) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, unit_price: e.target.value } : y)))} />
              <button className="rounded text-muted hover:text-danger" aria-label={t("Remove line")} onClick={() => setExtra((x) => x.filter((_, j) => j !== i))}><Trash2 className="mx-auto size-4" /></button>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="inv-st">
            <Select id="inv-st" value={issueNow ? "issue" : "draft"} onChange={(e) => setIssueNow(e.target.value === "issue")}>
              <option value="issue">{t("Issue now")}</option>
              <option value="draft">{t("Save as draft")}</option>
            </Select>
          </Field>
          {issueNow && <Field label="Issue date" htmlFor="inv-id"><Input id="inv-id" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>}
          <Field label="Payment due" htmlFor="inv-dd"><Input id="inv-dd" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <Field label="Notes on invoice" htmlFor="inv-n"><Textarea id="inv-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

export function PaymentDialog({ open, onOpenChange, d, presetClinic, presetInvoice }: {
  open: boolean; onOpenChange: (o: boolean) => void; presetClinic: string; presetInvoice?: string;
  d: {
    clinics: { id: string; name: string }[];
    invoices: { invoice_id: string; clinic_id: string; number: string; status: string; issue_date: string | null; outstanding: string }[];
    today: string;
    currency: string;
  };
}) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [clinic, setClinic] = React.useState(presetClinic);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(d.today);
  const [method, setMethod] = React.useState("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [alloc, setAlloc] = React.useState<Record<string, string>>({});
  const [key, setKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setClinic(presetClinic); setAmount(""); setDate(d.today); setMethod("bank_transfer"); setReference(""); setAlloc({});
    // One idempotency key per opened form: retries and double clicks can't create a second payment.
    newIdempotencyKey().then(setKey);
  }, [open, presetClinic, d.today]);
  const openInv = d.invoices.filter((i) => i.clinic_id === clinic && i.status === "issued" && D(i.outstanding).gt(0));
  React.useEffect(() => {
    if (presetInvoice && open) {
      const inv = d.invoices.find((i) => i.invoice_id === presetInvoice);
      if (inv) { setAmount(inv.outstanding); setAlloc({ [inv.invoice_id]: inv.outstanding }); }
    }
  }, [presetInvoice, open, d.invoices]);
  const allocated = money(Object.values(alloc).reduce((a, v) => (/^\d+([.,]\d{1,2})?$/.test(v) ? a.plus(D(v.replace(",", "."))) : a), D(0)));
  const amountOk = /^\d+([.,]\d{1,2})?$/.test(amount);
  const over = amountOk && D(allocated).gt(D(amount.replace(",", ".")));

  function autoAllocate() {
    if (!amountOk) return;
    let left = D(amount.replace(",", "."));
    const next: Record<string, string> = {};
    for (const i of [...openInv].sort((a, b) => (a.issue_date ?? "").localeCompare(b.issue_date ?? ""))) {
      if (left.lte(0)) break;
      const take = Decimalmin(left, D(i.outstanding));
      next[i.invoice_id] = money(take);
      left = left.minus(take);
    }
    setAlloc(next);
  }

  async function submit() {
    if (!key) return;
    setBusy(true);
    const r = await recordPaymentAction({
      clinic_id: clinic, amount, payment_date: date, method: method as "bank_transfer", reference, idempotency_key: key,
      allocations: Object.entries(alloc).filter(([, v]) => v && D(v.replace(",", ".")).gt(0)).map(([invoice_id, a]) => ({ invoice_id, amount: a })),
    });
    setBusy(false);
    if (r.ok) { toast.success(t("Payment of {0} recorded", { 0: fmt.money(amount.replace(",", "."), d.currency) })); onOpenChange(false); router.refresh(); }
    else toast.error(r.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={t("Record payment")}
      description="A payment is cash received. It reduces the balance of the invoices you apply it to; any remainder stays unapplied for later."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} loading={busy} disabled={!clinic || !amountOk || over || !key}>{t("Record payment")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinic" htmlFor="pay-c" required className="sm:col-span-2">
          <Select id="pay-c" value={clinic} onChange={(e) => { setClinic(e.target.value); setAlloc({}); }}>
            <option value="">{t("Choose a clinic")}</option>
            {d.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Amount received ({0})", { 0: d.currency })} htmlFor="pay-a" required><Input id="pay-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Date received" htmlFor="pay-d" required><Input id="pay-d" type="date" max={d.today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Method" htmlFor="pay-m">
          <Select id="pay-m" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select>
        </Field>
        <Field label="Reference" htmlFor="pay-r"><Input id="pay-r" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("Bank reference")} /></Field>
        {clinic && (
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-2">{t("Apply to open invoices")}</p>
              {openInv.length > 0 && amountOk && <button className="text-xs font-medium text-primary hover:underline" onClick={autoAllocate}>{t("Apply oldest first")}</button>}
            </div>
            {openInv.length === 0 ? <p className="text-[13px] text-muted">{t("This clinic has no open invoices. The payment will be recorded as unapplied.")}</p> : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {openInv.map((i) => (
                  <li key={i.invoice_id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="flex-1"><span className="font-medium">{i.number}</span> <span className="text-muted">· {t("outstanding {0}", { 0: fmt.money(i.outstanding, d.currency) })}</span></span>
                    <Input aria-label={t("Amount for {0}", { 0: i.number })} inputMode="decimal" className="h-8 w-28" value={alloc[i.invoice_id] ?? ""} onChange={(e) => setAlloc((a) => ({ ...a, [i.invoice_id]: e.target.value }))} placeholder="0.00" />
                  </li>
                ))}
              </ul>
            )}
            <p className={cn("mt-2 text-xs", over ? "text-danger" : "text-muted")}>
              {t("Applied {0}", { 0: fmt.money(allocated, d.currency) })}{amountOk && t(" · unapplied {0}", { 0: fmt.money(money(D(amount.replace(",", ".")).minus(D(allocated))), d.currency) })}{over && t(" — more than the payment amount")}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Decimalmin(a: ReturnType<typeof D>, b: ReturnType<typeof D>) {
  return a.lt(b) ? a : b;
}

function ExpenseDialog({ open, onOpenChange, d }: { open: boolean; onOpenChange: (o: boolean) => void; d: Data }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = React.useState({ category: "rent", description: "", amount: "", expense_date: d.today, recurrence: "one_time", notes: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setV({ category: "rent", description: "", amount: "", expense_date: d.today, recurrence: "one_time", notes: "" }); setErrors({}); } }, [open, d.today]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  async function submit() {
    setBusy(true);
    const r = await addExpenseAction(v as Parameters<typeof addExpenseAction>[0]);
    setBusy(false);
    if (r.ok) { toast.success("Expense recorded"); onOpenChange(false); router.refresh(); } else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("Add operating expense")}
      description="General business costs. They reduce operating profit for the period and are never assigned to cases."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} loading={busy}>{t("Save expense")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="ex-c"><Select id="ex-c" value={v.category} onChange={set("category")}>{Object.entries(EXPENSE_LABELS).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</Select></Field>
        <Field label={t("Amount ({0})", { 0: d.currency })} htmlFor="ex-a" error={errors.amount}><Input id="ex-a" inputMode="decimal" value={v.amount} onChange={set("amount")} placeholder="0.00" /></Field>
        <Field label="Description" htmlFor="ex-d" error={errors.description} className="sm:col-span-2"><Input id="ex-d" value={v.description} onChange={set("description")} placeholder={t("e.g. October workshop rent")} /></Field>
        <Field label="Date" htmlFor="ex-dt"><Input id="ex-dt" type="date" value={v.expense_date} onChange={set("expense_date")} /></Field>
        <Field label="Recurrence" htmlFor="ex-r">
          <Select id="ex-r" value={v.recurrence} onChange={set("recurrence")}>
            <option value="one_time">{t("One-time")}</option><option value="monthly">{t("Monthly")}</option><option value="quarterly">{t("Quarterly")}</option><option value="yearly">{t("Yearly")}</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
