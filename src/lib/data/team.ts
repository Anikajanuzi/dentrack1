import "server-only";
import { notFound } from "next/navigation";
import { withLab } from "@/lib/auth/context";

export async function getTeam() {
  return withLab(async (tx, ctx) => {
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const technicians = await tx<{
      id: string; full_name: string; job_title: string | null; is_active: boolean; user_id: string | null; email: string | null;
      active: number; overdue: number; due_week: number; completed_30d: number; completed_total: number; hours_30d: string | null;
    }[]>`
      select t.id, t.full_name, t.job_title, t.is_active, t.user_id, pr.email,
        count(c.id) filter (where c.lifecycle = 'active' and c.archived_at is null)::int as active,
        count(c.id) filter (where c.lifecycle = 'active' and c.archived_at is null and c.due_date < ${today}::date)::int as overdue,
        count(c.id) filter (where c.lifecycle = 'active' and c.archived_at is null and c.due_date between ${today}::date and ${today}::date + 7)::int as due_week,
        count(c.id) filter (where c.completed_at is not null and local_date(c.completed_at, ${ctx.lab.timezone}) > ${today}::date - 30)::int as completed_30d,
        count(c.id) filter (where c.completed_at is not null)::int as completed_total,
        ${ctx.canManageCosts
          ? tx`(select coalesce(sum(e.hours), 0)::text from case_labor_entries e where e.technician_id = t.id and e.entry_type = 'hours' and e.work_date > ${today}::date - 30)`
          : tx`null::text`} as hours_30d
      from technicians t
      left join cases c on c.technician_id = t.id
      left join profiles pr on pr.id = t.user_id
      where t.laboratory_id = ${ctx.lab.id}
      group by t.id, pr.email order by t.is_active desc, t.full_name`;
    const members = ctx.isAdmin
      ? await tx<{ id: string; user_id: string; full_name: string | null; email: string | null; role: "admin" | "technician"; can_manage_costs: boolean; is_active: boolean }[]>`
          select m.id, m.user_id, pr.full_name, pr.email, m.role, m.can_manage_costs, m.is_active
          from laboratory_memberships m join profiles pr on pr.id = m.user_id where m.laboratory_id = ${ctx.lab.id} order by m.role, pr.full_name`
      : [];
    const invitations = ctx.isAdmin
      ? await tx<{ id: string; email: string; role: string; can_manage_costs: boolean; created_at: string; technician: string | null }[]>`
          select i.id, i.email, i.role::text, i.can_manage_costs, i.created_at, t.full_name as technician
          from lab_invitations i left join technicians t on t.id = i.technician_id
          where i.laboratory_id = ${ctx.lab.id} and i.accepted_at is null order by i.created_at desc`
      : [];
    return { today, technicians, members, invitations, isAdmin: ctx.isAdmin, canManageCosts: ctx.canManageCosts, me: ctx.user.id };
  });
}

export async function getTechnician(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return withLab(async (tx, ctx) => {
    const [t] = await tx<{ id: string; full_name: string; job_title: string | null; is_active: boolean; email: string | null }[]>`
      select t.id, t.full_name, t.job_title, t.is_active, pr.email from technicians t left join profiles pr on pr.id = t.user_id
      where t.id = ${id} and t.laboratory_id = ${ctx.lab.id}`;
    if (!t) notFound();
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const cases = await tx<{ id: string; reference: string; lifecycle: string; due_date: string; stage: string; category: string; tray_number: number | null; completed_at: string | null }[]>`
      select c.id, c.reference, c.lifecycle::text, c.due_date, s.name as stage, cat.name as category, tr.number as tray_number, c.completed_at
      from cases c join production_stages s on s.id = c.stage_id join prosthetic_categories cat on cat.id = c.category_id
      left join tray_assignments a on a.case_id = c.id and a.released_at is null left join trays tr on tr.id = a.tray_id
      where c.technician_id = ${id} and c.archived_at is null
      order by (c.lifecycle <> 'active'), c.due_date limit 100`;
    const activity = await tx<{ id: number; summary: string; created_at: string; case_id: string | null }[]>`
      select l.id, l.summary, l.created_at, l.case_id from activity_logs l
      join cases c on c.id = l.case_id where c.technician_id = ${id} order by l.created_at desc limit 25`;
    return { t, today, cases, activity, dueSoonDays: ctx.lab.due_soon_days, timezone: ctx.lab.timezone, isAdmin: ctx.isAdmin };
  });
}
