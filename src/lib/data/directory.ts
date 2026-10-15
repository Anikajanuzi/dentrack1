import "server-only";
import { notFound } from "next/navigation";
import { withLab } from "@/lib/auth/context";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function listClinics() {
  return withLab(async (tx, ctx) => {
    const clinics = await tx<{ id: string; name: string; email: string | null; phone: string | null; address: string | null; is_active: boolean; dentists: string[] | null; active_cases: number; completed_cases: number; outstanding: string | null }[]>`
      select cl.id, cl.name, cl.email, cl.phone, cl.address, cl.is_active,
        (select array_agg(d.full_name order by d.full_name) from dentists d where d.clinic_id = cl.id) as dentists,
        (select count(*)::int from cases c where c.clinic_id = cl.id and c.lifecycle = 'active' and c.archived_at is null) as active_cases,
        (select count(*)::int from cases c where c.clinic_id = cl.id and c.lifecycle in ('completed', 'delivered')) as completed_cases,
        ${ctx.isAdmin ? tx`(select coalesce(sum(outstanding), 0)::text from invoice_balances b where b.clinic_id = cl.id and b.status = 'issued')` : tx`null::text`} as outstanding
      from clinics cl where cl.laboratory_id = ${ctx.lab.id} order by cl.is_active desc, cl.name`;
    // Row Level Security limits technicians to patients of their own cases.
    const patients = await tx<{ id: string; reference: string; full_name: string | null; clinic: string | null; clinic_id: string | null; active_cases: number; total_cases: number; last_received: string | null }[]>`
          select p.id, p.reference, p.full_name, cl.name as clinic, p.clinic_id,
            (select count(*)::int from cases c where c.patient_id = p.id and c.lifecycle = 'active') as active_cases,
            (select count(*)::int from cases c where c.patient_id = p.id) as total_cases,
            (select max(received_date) from cases c where c.patient_id = p.id) as last_received
          from patients p left join clinics cl on cl.id = p.clinic_id
          where p.laboratory_id = ${ctx.lab.id} order by p.reference`;
    return { clinics, patients, isAdmin: ctx.isAdmin, currency: ctx.lab.currency };
  });
}

export async function getClinic(id: string) {
  if (!isUuid(id)) notFound();
  return withLab(async (tx, ctx) => {
    const [clinic] = await tx<{ id: string; name: string; email: string | null; phone: string | null; address: string | null; notes: string | null; is_active: boolean }[]>`
      select id, name, email, phone, address, notes, is_active from clinics where id = ${id} and laboratory_id = ${ctx.lab.id}`;
    if (!clinic) notFound();
    const dentists = await tx<{ id: string; full_name: string; email: string | null; phone: string | null }[]>`
      select id, full_name, email, phone from dentists where clinic_id = ${id} order by full_name`;
    const cases = await tx<{ id: string; reference: string; lifecycle: string; due_date: string; category: string; patient: string | null; archived_at: string | null }[]>`
      select c.id, c.reference, c.lifecycle::text, c.due_date, cat.name as category, p.reference as patient, c.archived_at
      from cases c join prosthetic_categories cat on cat.id = c.category_id left join patients p on p.id = c.patient_id
      where c.clinic_id = ${id} order by c.received_date desc limit 100`;
    const invoices = ctx.isAdmin
      ? await tx<{ invoice_id: string; number: string; payment_status: string; issue_date: string | null; due_date: string | null; total: string; paid: string; credited: string; outstanding: string }[]>`
          select invoice_id, number, payment_status, issue_date, due_date, total::text, paid::text, credited::text, outstanding::text
          from invoice_balances where clinic_id = ${id} order by issue_date desc nulls first, number desc`
      : [];
    const payments = ctx.isAdmin
      ? await tx<{ id: string; amount: string; payment_date: string; method: string; reference: string | null; unapplied: string }[]>`
          select p.id, p.amount::text, p.payment_date, p.method, p.reference,
                 (p.amount - coalesce((select sum(a.amount) from payment_allocations a where a.payment_id = p.id), 0))::text as unapplied
          from payments p where p.clinic_id = ${id} order by p.payment_date desc limit 50`
      : [];
    return { clinic, dentists, cases, invoices, payments, isAdmin: ctx.isAdmin, currency: ctx.lab.currency };
  });
}

export async function getPatient(id: string) {
  if (!isUuid(id)) notFound();
  return withLab(async (tx, ctx) => {
    const [patient] = await tx<{ id: string; reference: string; full_name: string | null; notes: string | null; clinic_id: string | null; clinic: string | null }[]>`
      select p.id, p.reference, p.full_name, p.notes, p.clinic_id, cl.name as clinic
      from patients p left join clinics cl on cl.id = p.clinic_id where p.id = ${id} and p.laboratory_id = ${ctx.lab.id}`;
    if (!patient) notFound(); // RLS hides patients a technician isn't working on
    const cases = await tx<{ id: string; reference: string; lifecycle: string; due_date: string; received_date: string; category: string; service: string | null; technician: string | null; archived_at: string | null }[]>`
      select c.id, c.reference, c.lifecycle::text, c.due_date, c.received_date, cat.name as category, sv.name as service, t.full_name as technician, c.archived_at
      from cases c join prosthetic_categories cat on cat.id = c.category_id left join services sv on sv.id = c.service_id
      left join technicians t on t.id = c.technician_id where c.patient_id = ${id} order by c.received_date desc`;
    return { patient, cases, isAdmin: ctx.isAdmin, clinics: await tx<{ id: string; name: string }[]>`select id, name from clinics where laboratory_id = ${ctx.lab.id} order by name` };
  });
}
