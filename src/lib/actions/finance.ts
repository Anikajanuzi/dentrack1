"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { run } from "./run";
import { fromZod, type ActionResult } from "./result";

const amount = z.string().trim().transform((v) => v.replace(",", ".")).refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), "Enter an amount like 120.00");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const invoiceSchema = z.object({
  clinic_id: z.string().uuid("Choose a clinic"),
  case_ids: z.array(z.string().uuid()).default([]),
  extra_lines: z.array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.string(), unit_price: amount })).default([]),
  issue: z.boolean(),
  issue_date: date.optional(),
  due_date: z.union([z.literal(""), date]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function createInvoiceAction(input: z.input<typeof invoiceSchema>): Promise<ActionResult<string>> {
  const p = invoiceSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    const [r] = await tx<{ id: string }[]>`
      select create_invoice(${ctx.lab.id}, ${v.clinic_id}, ${v.case_ids}::uuid[], ${tx.json(v.extra_lines)}, ${v.issue},
                            ${v.issue_date ?? null}, ${v.due_date || null}, ${v.notes ?? null}) as id`;
    return r.id;
  }, { message: v.issue ? "Invoice issued" : "Draft invoice saved" });
}

export async function issueInvoiceAction(id: string, issueDate?: string, dueDate?: string): Promise<ActionResult> {
  return run((tx) => tx`select issue_invoice(${id}, ${issueDate || null}, ${dueDate || null})`.then(() => undefined), { message: "Invoice issued" });
}

export async function voidInvoiceAction(id: string, reason: string): Promise<ActionResult> {
  return run((tx) => tx`select void_invoice(${id}, ${reason})`.then(() => undefined), { message: "Invoice voided" });
}

const paymentSchema = z.object({
  clinic_id: z.string().uuid("Choose a clinic"),
  amount,
  payment_date: date,
  method: z.enum(["bank_transfer", "cash", "card", "cheque", "other"]),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotency_key: z.string().uuid(),
  allocations: z.array(z.object({ invoice_id: z.string().uuid(), amount })).default([]),
});

/** The client generates idempotency_key once per form, so double clicks and retries never duplicate a payment. */
export async function recordPaymentAction(input: z.input<typeof paymentSchema>): Promise<ActionResult<string>> {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    const [r] = await tx<{ id: string }[]>`
      select record_payment(${ctx.lab.id}, ${v.clinic_id}, ${v.amount}, ${v.payment_date}, ${v.method}, ${v.reference ?? null},
                            ${v.idempotency_key}, ${tx.json(v.allocations)}, ${v.notes ?? null}) as id`;
    return r.id;
  }, { message: "Payment recorded" });
}

export async function allocatePaymentAction(paymentId: string, invoiceId: string, amt: string): Promise<ActionResult> {
  const a = amount.safeParse(amt);
  if (!a.success) return { ok: false, error: "Enter an amount like 50.00" };
  return run((tx) => tx`select allocate_payment(${paymentId}, ${invoiceId}, ${a.data})`.then(() => undefined), { message: "Payment applied" });
}

export async function addCreditNoteAction(invoiceId: string, amt: string, reason: string, issueDate?: string): Promise<ActionResult> {
  const a = amount.safeParse(amt);
  if (!a.success) return { ok: false, error: "Enter an amount like 10.00" };
  if (reason.trim().length < 2) return { ok: false, error: "Give a reason for the credit" };
  return run((tx) => tx`select add_credit_note(${invoiceId}, ${a.data}, ${reason}, ${issueDate || null})`.then(() => undefined), { message: "Credit applied" });
}

const expenseSchema = z.object({
  category: z.enum(["rent", "electricity", "water", "internet", "equipment_maintenance", "admin_salaries", "software", "insurance", "other"]),
  description: z.string().trim().min(1, "Describe the expense").max(200),
  amount,
  expense_date: date,
  recurrence: z.enum(["one_time", "monthly", "quarterly", "yearly"]),
  notes: z.string().trim().max(500).optional(),
});

export async function addExpenseAction(input: z.input<typeof expenseSchema>): Promise<ActionResult> {
  const p = expenseSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    const r = await tx`insert into operating_expenses (laboratory_id, category, description, amount, expense_date, recurrence, notes, created_by)
             values (${ctx.lab.id}, ${v.category}, ${v.description}, ${v.amount}, ${v.expense_date}, ${v.recurrence}, ${v.notes ?? null}, ${ctx.user.id})`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: "Expense recorded" });
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`delete from operating_expenses where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: "Expense deleted" });
}

export async function newIdempotencyKey(): Promise<string> {
  return randomUUID();
}
