import "server-only";
import { notFound } from "next/navigation";
import { withLab } from "@/lib/auth/context";

export interface CaseListRow {
  id: string;
  reference: string;
  lifecycle: "active" | "completed" | "delivered" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string;
  received_date: string;
  stage: string;
  category: string;
  service: string | null;
  clinic: string;
  technician: string | null;
  technician_id: string | null;
  patient_reference: string | null;
  tray_number: number | null;
  archived_at: string | null;
}

export interface CaseFilters {
  q?: string;
  status?: string; // active | completed | delivered | cancelled | open | all
  due?: string; // overdue | soon
  tech?: string; // uuid | none
  clinic?: string;
  category?: string;
  service?: string;
  sort?: string; // due | received | reference
  archived?: boolean;
  page?: number;
}

const PAGE_SIZE = 50;

export async function listCases(f: CaseFilters) {
  return withLab(async (tx, ctx) => {
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const q = f.q?.trim() ? `%${f.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
    const status = f.status ?? (f.archived ? "all" : "open");
    const page = Math.max(1, f.page ?? 1);
    const uuidish = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
    const order =
      f.sort === "received" ? tx`c.received_date desc, c.reference desc`
      : f.sort === "reference" ? tx`c.reference desc`
      : f.archived ? tx`c.archived_at desc`
      : tx`(c.lifecycle <> 'active'), c.due_date, c.reference`;

    const rows = await tx<(CaseListRow & { total: number })[]>`
      select c.id, c.reference, c.lifecycle, c.priority, c.due_date, c.received_date, s.name as stage, cat.name as category,
             sv.name as service, cl.name as clinic, t.full_name as technician, c.technician_id, p.reference as patient_reference,
             tr.number as tray_number, c.archived_at, count(*) over ()::int as total
      from cases c
      join production_stages s on s.id = c.stage_id
      join prosthetic_categories cat on cat.id = c.category_id
      left join services sv on sv.id = c.service_id
      join clinics cl on cl.id = c.clinic_id
      left join technicians t on t.id = c.technician_id
      left join patients p on p.id = c.patient_id
      left join tray_assignments a on a.case_id = c.id and a.released_at is null
      left join trays tr on tr.id = a.tray_id
      where c.laboratory_id = ${ctx.lab.id}
        and ${f.archived ? tx`c.archived_at is not null` : tx`c.archived_at is null`}
        and ${status === "open" ? tx`c.lifecycle in ('active', 'completed')` : status === "all" ? tx`true` : tx`c.lifecycle = ${status}`}
        and ${f.due === "overdue" ? tx`c.lifecycle = 'active' and c.due_date < ${today}::date`
             : f.due === "soon" ? tx`c.lifecycle = 'active' and c.due_date between ${today}::date and ${today}::date + ${ctx.lab.due_soon_days}::int`
             : tx`true`}
        and ${f.tech === "none" ? tx`c.technician_id is null` : uuidish(f.tech) ? tx`c.technician_id = ${f.tech!}` : tx`true`}
        and ${uuidish(f.clinic) ? tx`c.clinic_id = ${f.clinic!}` : tx`true`}
        and ${uuidish(f.category) ? tx`c.category_id = ${f.category!}` : tx`true`}
        and ${uuidish(f.service) ? tx`c.service_id = ${f.service!}` : tx`true`}
        and ${q ? tx`(c.reference ilike ${q} or p.reference ilike ${q} or p.full_name ilike ${q} or cl.name ilike ${q} or t.full_name ilike ${q} or tr.number::text = ${f.q!.trim().replace(/^#0*/, "")})` : tx`true`}
      order by ${order}
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`;

    const options = await caseFormOptions(tx, ctx.lab.id, ctx.isAdmin);
    return {
      today,
      dueSoonDays: ctx.lab.due_soon_days,
      rows,
      total: rows[0]?.total ?? 0,
      page,
      pageSize: PAGE_SIZE,
      options,
      isAdmin: ctx.isAdmin,
      myTechnicianId: ctx.technicianId,
    };
  });
}

type Tx = Parameters<Parameters<typeof withLab>[0]>[0];

export async function caseFormOptions(tx: Tx, labId: string, isAdmin: boolean) {
  const clinics = await tx<{ id: string; name: string }[]>`select id, name from clinics where laboratory_id = ${labId} and is_active order by name`;
  const dentists = await tx<{ id: string; clinic_id: string; full_name: string }[]>`select id, clinic_id, full_name from dentists where laboratory_id = ${labId} order by full_name`;
  const categories = await tx<{ id: string; name: string }[]>`select id, name from prosthetic_categories where laboratory_id = ${labId} and is_active order by position, name`;
  const services = isAdmin
    ? await tx<{ id: string; category_id: string; name: string; price: string | null }[]>`
        select s.id, s.category_id, s.name,
          (select price::text from service_prices p where p.service_id = s.id and p.effective_from <= lab_today(${labId}) order by effective_from desc limit 1) as price
        from services s where s.laboratory_id = ${labId} and s.is_active order by s.name`
    : await tx<{ id: string; category_id: string; name: string; price: string | null }[]>`
        select id, category_id, name, null::text as price from services where laboratory_id = ${labId} and is_active order by name`;
  const technicians = await tx<{ id: string; full_name: string }[]>`select id, full_name from technicians where laboratory_id = ${labId} and is_active order by full_name`;
  const trays = await tx<{ id: string; number: number; label: string | null }[]>`
    select tray_id as id, number, label from tray_board where laboratory_id = ${labId} and is_active and case_id is null order by number`;
  const patients = await tx<{ id: string; reference: string; full_name: string | null; clinic_id: string | null }[]>`
    select id, reference, full_name, clinic_id from patients where laboratory_id = ${labId} order by reference`;
  const stages = await tx<{ id: string; name: string; position: number; system_key: string | null }[]>`
    select id, name, position, system_key::text from production_stages where laboratory_id = ${labId} order by position`;
  return { clinics, dentists, categories, services, technicians, trays, patients, stages };
}

export async function getNewCaseOptions() {
  return withLab(async (tx, ctx) => {
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    return { today, currency: ctx.lab.currency, isAdmin: ctx.isAdmin, myTechnicianId: ctx.technicianId, ...(await caseFormOptions(tx, ctx.lab.id, ctx.isAdmin)) };
  });
}

export interface CaseDetail {
  id: string;
  reference: string;
  lifecycle: "active" | "completed" | "delivered" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  units: number;
  tooth_numbers: string | null;
  shade: string | null;
  received_date: string;
  due_date: string;
  completed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  patient_id: string;
  patient_reference: string | null;
  patient_name: string | null;
  clinic_id: string;
  clinic: string;
  dentist_id: string | null;
  dentist: string | null;
  category_id: string;
  category: string;
  service_id: string | null;
  service: string | null;
  technician_id: string | null;
  technician: string | null;
  stage_id: string;
  stage: string;
  tray_id: string | null;
  tray_number: number | null;
  tray_assigned_at: string | null;
  materials_confirmed: boolean;
  labor_confirmed: boolean;
  other_costs_confirmed: boolean;
}

export async function getCase(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return withLab(async (tx, ctx) => {
    const [c] = await tx<CaseDetail[]>`
      select c.id, c.reference, c.lifecycle, c.priority, c.units, c.tooth_numbers, c.shade, c.received_date, c.due_date,
             c.completed_at, c.delivered_at, c.cancelled_at, c.archived_at, c.notes, c.created_at,
             c.patient_id, p.reference as patient_reference, p.full_name as patient_name,
             c.clinic_id, cl.name as clinic, c.dentist_id, d.full_name as dentist,
             c.category_id, cat.name as category, c.service_id, sv.name as service,
             c.technician_id, t.full_name as technician, c.stage_id, s.name as stage,
             a.tray_id, tr.number as tray_number, a.assigned_at as tray_assigned_at,
             c.materials_confirmed, c.labor_confirmed, c.other_costs_confirmed
      from cases c
      left join patients p on p.id = c.patient_id
      join clinics cl on cl.id = c.clinic_id
      left join dentists d on d.id = c.dentist_id
      join prosthetic_categories cat on cat.id = c.category_id
      left join services sv on sv.id = c.service_id
      left join technicians t on t.id = c.technician_id
      join production_stages s on s.id = c.stage_id
      left join tray_assignments a on a.case_id = c.id and a.released_at is null
      left join trays tr on tr.id = a.tray_id
      where c.id = ${id} and c.laboratory_id = ${ctx.lab.id}`;
    if (!c) notFound();

    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const history = await tx<{ id: string; from_stage: string | null; to_stage: string; to_stage_id: string; changed_at: string; actor: string | null; note: string | null }[]>`
      select h.id, fs.name as from_stage, ts.name as to_stage, h.to_stage_id, h.changed_at, pr.full_name as actor, h.note
      from case_status_history h
      left join production_stages fs on fs.id = h.from_stage_id
      join production_stages ts on ts.id = h.to_stage_id
      left join profiles pr on pr.id = h.changed_by
      where h.case_id = ${id} order by h.changed_at`;
    const trayHistory = await tx<{ id: string; number: number; assigned_at: string; released_at: string | null; release_reason: string | null }[]>`
      select a.id, t.number, a.assigned_at, a.released_at, a.release_reason
      from tray_assignments a join trays t on t.id = a.tray_id where a.case_id = ${id} order by a.assigned_at desc`;
    const notes = await tx<{ id: string; body: string; created_at: string; author: string | null; author_id: string | null }[]>`
      select n.id, n.body, n.created_at, pr.full_name as author, n.author_id
      from case_notes n left join profiles pr on pr.id = n.author_id where n.case_id = ${id} order by n.created_at desc`;
    const files = await tx<{ id: string; file_name: string; size_bytes: number; mime_type: string | null; created_at: string; uploaded_by: string | null; uploader: string | null }[]>`
      select f.id, f.file_name, f.size_bytes::int, f.mime_type, f.created_at, f.uploaded_by, pr.full_name as uploader
      from case_attachments f left join profiles pr on pr.id = f.uploaded_by where f.case_id = ${id} order by f.created_at desc`;
    const activity = await tx<{ id: number; action: string; summary: string; created_at: string; actor: string | null }[]>`
      select l.id, l.action, l.summary, l.created_at, pr.full_name as actor
      from activity_logs l left join profiles pr on pr.id = l.actor_id where l.case_id = ${id} order by l.created_at desc limit 100`;

    let costs = null;
    if (ctx.canManageCosts) {
      const [summary] = await tx<{
        material_total: string; labor_total: string; other_total: string; material_entries: number; labor_entries: number;
        other_entries: number; estimate_entries: number; materials_confirmed: boolean; labor_confirmed: boolean; other_costs_confirmed: boolean;
      }[]>`select material_total::text, labor_total::text, other_total::text, material_entries, labor_entries, other_entries, estimate_entries,
              materials_confirmed, labor_confirmed, other_costs_confirmed from case_cost_summary where case_id = ${id}`;
      const materials = await tx<{ id: string; material_name: string; unit: string; quantity: string; unit_cost: string; line_total: string; basis: string; recorded_on: string; notes: string | null; material_id: string | null }[]>`
        select id, material_name, unit, quantity::text, unit_cost::text, line_total::text, basis::text, recorded_on, notes, material_id
        from case_material_costs where case_id = ${id} order by created_at`;
      const labor = await tx<{ id: string; technician_name: string; technician_id: string | null; task: string; entry_type: string; hours: string | null; hourly_rate: string | null; manual_amount: string | null; amount: string; basis: string; work_date: string }[]>`
        select id, technician_name, technician_id, task, entry_type::text, hours::text, hourly_rate::text, manual_amount::text, amount::text, basis::text, work_date
        from case_labor_entries where case_id = ${id} order by created_at`;
      const other = await tx<{ id: string; category: string; description: string; amount: string; cost_date: string; supplier: string | null; notes: string | null; basis: string }[]>`
        select id, category::text, description, amount::text, cost_date, supplier, notes, basis::text
        from case_other_direct_costs where case_id = ${id} order by cost_date, created_at`;
      const catalog = await tx<{ id: string; name: string; unit: string; default_unit_cost: string | null }[]>`
        select id, name, unit, default_unit_cost::text from material_catalog where laboratory_id = ${ctx.lab.id} and is_active order by name`;
      const rates = await tx<{ technician_id: string | null; hourly_rate: string }[]>`
        select distinct on (technician_id) technician_id, hourly_rate::text from labor_rates
        where laboratory_id = ${ctx.lab.id} and effective_from <= ${today}::date order by technician_id, effective_from desc`;
      costs = { summary, materials, labor, other, catalog, rates };
    }

    let finance = null;
    if (ctx.isAdmin) {
      const [f] = await tx<{ selling_price: string | null; discount_amount: string; estimated_direct_cost: string | null; price_source: string | null }[]>`
        select selling_price::text, discount_amount::text, estimated_direct_cost::text, price_source from case_financials where case_id = ${id}`;
      const billing = await tx<{ invoice_id: string; number: string; status: string; issue_date: string | null; line_amount: string; invoice_total: string; invoice_paid: string; invoice_credited: string; invoice_outstanding: string; lines_on_invoice: number }[]>`
        select b.invoice_id, b.number, b.payment_status as status, b.issue_date, l.amount::text as line_amount, b.total::text as invoice_total,
               b.paid::text as invoice_paid, b.credited::text as invoice_credited, b.outstanding::text as invoice_outstanding,
               (select count(*)::int from invoice_lines x where x.invoice_id = b.invoice_id and not x.voided) as lines_on_invoice
        from invoice_lines l join invoice_balances b on b.invoice_id = l.invoice_id
        where l.case_id = ${id} and not l.voided`;
      finance = { ...(f ?? { selling_price: null, discount_amount: "0", estimated_direct_cost: null, price_source: null }), billing };
    }

    const options = await caseFormOptions(tx, ctx.lab.id, ctx.isAdmin);
    return {
      c,
      today,
      dueSoonDays: ctx.lab.due_soon_days,
      currency: ctx.lab.currency,
      timezone: ctx.lab.timezone,
      history,
      trayHistory,
      notes,
      files,
      activity,
      costs,
      finance,
      options,
      perms: {
        isAdmin: ctx.isAdmin,
        canManageCosts: ctx.canManageCosts,
        isAssignee: Boolean(ctx.technicianId && ctx.technicianId === c.technician_id),
        canMoveStage: ctx.isAdmin || !c.technician_id || ctx.technicianId === c.technician_id,
        userId: ctx.user.id,
      },
    };
  });
}

export type CaseData = Awaited<ReturnType<typeof getCase>>;
