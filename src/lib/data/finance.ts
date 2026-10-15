import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/context";
import { asUser } from "@/lib/db";

export async function getFinance() {
  const ctx = await requireAdmin();
  return asUser(ctx.user.id, async (tx) => {
    const lab = ctx.lab.id;
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${lab})::text as today`;
    const invoices = await tx<{ invoice_id: string; number: string; clinic_id: string; clinic: string; status: string; payment_status: string; issue_date: string | null; due_date: string | null; total: string; paid: string; credited: string; outstanding: string; lines: number }[]>`
      select b.invoice_id, b.number, b.clinic_id, cl.name as clinic, b.status::text, b.payment_status, b.issue_date, b.due_date,
             b.total::text, b.paid::text, b.credited::text, b.outstanding::text,
             (select count(*)::int from invoice_lines l where l.invoice_id = b.invoice_id and not l.voided) as lines
      from invoice_balances b join clinics cl on cl.id = b.clinic_id
      where b.laboratory_id = ${lab} order by b.issue_date desc nulls first, b.number desc`;
    const payments = await tx<{ id: string; clinic_id: string; clinic: string; amount: string; payment_date: string; method: string; reference: string | null; applied: string; unapplied: string; invoices: string | null }[]>`
      select p.id, p.clinic_id, cl.name as clinic, p.amount::text, p.payment_date, p.method, p.reference,
             coalesce(sum(a.amount), 0)::text as applied, (p.amount - coalesce(sum(a.amount), 0))::text as unapplied,
             string_agg(i.number, ', ' order by i.number) as invoices
      from payments p join clinics cl on cl.id = p.clinic_id
      left join payment_allocations a on a.payment_id = p.id left join invoices i on i.id = a.invoice_id
      where p.laboratory_id = ${lab} group by p.id, cl.name order by p.payment_date desc, p.created_at desc`;
    const expenses = await tx<{ id: string; category: string; description: string; amount: string; expense_date: string; recurrence: string; notes: string | null }[]>`
      select id, category::text, description, amount::text, expense_date, recurrence::text, notes
      from operating_expenses where laboratory_id = ${lab} order by expense_date desc, created_at desc`;
    const uninvoiced = await tx<{ id: string; reference: string; clinic_id: string; lifecycle: string; net: string | null; delivered_at: string | null; item: string }[]>`
      select c.id, c.reference, c.clinic_id, c.lifecycle::text, (f.selling_price - f.discount_amount)::text as net, c.delivered_at,
             coalesce(s.name, cat.name) as item
      from cases c left join case_financials f on f.case_id = c.id left join services s on s.id = c.service_id
      join prosthetic_categories cat on cat.id = c.category_id
      where c.laboratory_id = ${lab} and c.lifecycle in ('completed', 'delivered')
        and not exists (select 1 from invoice_lines l where l.case_id = c.id and not l.voided)
      order by c.delivered_at nulls last, c.reference`;
    const clinics = await tx<{ id: string; name: string }[]>`select id, name from clinics where laboratory_id = ${lab} order by name`;
    return { today, invoices, payments, expenses, uninvoiced, clinics, currency: ctx.lab.currency };
  });
}

export async function getInvoice(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireAdmin();
  return asUser(ctx.user.id, async (tx) => {
    const [inv] = await tx<{ invoice_id: string; number: string; status: string; payment_status: string; issue_date: string | null; due_date: string | null; total: string; paid: string; credited: string; outstanding: string; clinic_id: string; clinic: string; clinic_email: string | null; clinic_address: string | null; notes: string | null; void_reason: string | null }[]>`
      select b.invoice_id, b.number, b.status::text, b.payment_status, b.issue_date, b.due_date, b.total::text, b.paid::text, b.credited::text, b.outstanding::text,
             b.clinic_id, cl.name as clinic, cl.email as clinic_email, cl.address as clinic_address, i.notes, i.void_reason
      from invoice_balances b join invoices i on i.id = b.invoice_id join clinics cl on cl.id = b.clinic_id
      where b.invoice_id = ${id} and b.laboratory_id = ${ctx.lab.id}`;
    if (!inv) notFound();
    const lines = await tx<{ id: string; case_id: string | null; reference: string | null; description: string; quantity: string; unit_price: string; amount: string; voided: boolean }[]>`
      select l.id, l.case_id, c.reference, l.description, l.quantity::text, l.unit_price::text, l.amount::text, l.voided
      from invoice_lines l left join cases c on c.id = l.case_id where l.invoice_id = ${id} order by c.reference nulls last, l.description`;
    const allocations = await tx<{ id: string; amount: string; payment_date: string; method: string; reference: string | null }[]>`
      select a.id, a.amount::text, p.payment_date, p.method, p.reference from payment_allocations a join payments p on p.id = a.payment_id
      where a.invoice_id = ${id} order by p.payment_date`;
    const credits = await tx<{ id: string; amount: string; reason: string; issue_date: string }[]>`
      select id, amount::text, reason, issue_date from credit_notes where invoice_id = ${id} order by issue_date`;
    const unapplied = await tx<{ id: string; payment_date: string; unapplied: string; reference: string | null }[]>`
      select p.id, p.payment_date, (p.amount - coalesce(sum(a.amount), 0))::text as unapplied, p.reference
      from payments p left join payment_allocations a on a.payment_id = p.id
      where p.clinic_id = ${inv.clinic_id} group by p.id having p.amount - coalesce(sum(a.amount), 0) > 0 order by p.payment_date`;
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    return { inv, lines, allocations, credits, unapplied, lab: ctx.lab, today };
  });
}
