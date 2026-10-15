import "server-only";
import { withLab } from "@/lib/auth/context";

export interface TrayRow {
  tray_id: string;
  number: number;
  label: string | null;
  is_active: boolean;
  assignment_id: string | null;
  assigned_at: string | null;
  case_id: string | null;
  case_reference: string | null;
  due_date: string | null;
  priority: "low" | "normal" | "high" | "urgent" | null;
  lifecycle: "active" | "completed" | "delivered" | "cancelled" | null;
  stage_name: string | null;
  technician_id: string | null;
  technician_name: string | null;
  category_name: string | null;
  clinic_name: string | null;
  patient_reference: string | null;
}

export interface PlaceableCase {
  id: string;
  reference: string;
  due_date: string;
  lifecycle: string;
  category: string;
  technician: string | null;
  patient_reference: string | null;
}

export async function getTrayBoard() {
  return withLab(async (tx, ctx) => {
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const trays = await tx<TrayRow[]>`
      select b.tray_id, b.number, b.label, b.is_active, b.assignment_id, b.assigned_at, b.case_id, b.case_reference,
             b.due_date, b.priority, b.lifecycle, b.stage_name, b.technician_id, b.technician_name, b.category_name,
             b.clinic_name, p.reference as patient_reference
      from tray_board b left join patients p on p.id = b.patient_id
      where b.laboratory_id = ${ctx.lab.id}
      order by b.number`;
    const placeable = await tx<PlaceableCase[]>`
      select c.id, c.reference, c.due_date, c.lifecycle::text, cat.name as category, t.full_name as technician, p.reference as patient_reference
      from cases c
      join prosthetic_categories cat on cat.id = c.category_id
      left join technicians t on t.id = c.technician_id
      left join patients p on p.id = c.patient_id
      where c.laboratory_id = ${ctx.lab.id} and c.archived_at is null and c.lifecycle in ('active', 'completed')
        and not exists (select 1 from tray_assignments a where a.case_id = c.id and a.released_at is null)
      order by c.due_date, c.reference`;
    const technicians = await tx<{ id: string; full_name: string }[]>`
      select id, full_name from technicians where laboratory_id = ${ctx.lab.id} and is_active order by full_name`;
    return { today, dueSoonDays: ctx.lab.due_soon_days, trays, placeable, technicians, isAdmin: ctx.isAdmin, myTechnicianId: ctx.technicianId };
  });
}

export async function getTrayHistory(trayId: string) {
  return withLab(async (tx) =>
    tx<{ id: string; case_id: string; reference: string; assigned_at: string; released_at: string | null; release_reason: string | null }[]>`
      select a.id, a.case_id, c.reference, a.assigned_at, a.released_at, a.release_reason
      from tray_assignments a join cases c on c.id = a.case_id
      where a.tray_id = ${trayId} order by a.assigned_at desc limit 20`,
  );
}
