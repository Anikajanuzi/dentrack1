import "server-only";
import { withLab } from "@/lib/auth/context";

export interface DashboardData {
  today: string;
  due_soon_days: number;
  trays: { active: number; occupied: number; available: number; inactive: number };
  cases: {
    active: number; due_soon: number; overdue: number; awaiting_delivery: number;
    completed_this_month: number; delivered_this_month: number; completed_awaiting_tray_release: number;
  };
  deadlines: Array<{ id: string; reference: string; due_date: string; priority: "low" | "normal" | "high" | "urgent"; stage: string; technician: string | null; tray_number: number | null; category: string; days_left: number }>;
  activity: Array<{ id: number; action: string; summary: string; case_id: string | null; created_at: string; actor: string | null }>;
  completions_by_week: Array<{ week_start: string; completed: number }>;
  workload: Array<{ technician_id: string; name: string; active: number; due_soon: number; overdue: number }>;
  unassigned_active: number;
  finance?: { period_start: string; billed_sales: string; payments_received: string; outstanding_receivables: string; currency: string };
}

export async function getDashboard() {
  return withLab(async (tx, ctx) => {
    const [{ j }] = await tx<{ j: DashboardData }[]>`select dashboard_overview(${ctx.lab.id}) as j`;
    const trayMap = await tx<{ id: string; number: number; occupied: boolean; is_active: boolean; due_date: string | null; lifecycle: string | null }[]>`
      select tray_id as id, number, case_id is not null as occupied, is_active, due_date, lifecycle::text
      from tray_board where laboratory_id = ${ctx.lab.id} order by number`;
    const pipeline = await tx<{ id: string; name: string; cases: number }[]>`
      select s.id, s.name,
        (select count(*)::int from cases c where c.stage_id = s.id and c.archived_at is null
           and (s.system_key is distinct from 'delivered' or local_date(c.delivered_at, ${ctx.lab.timezone}) >= date_trunc('month', lab_today(${ctx.lab.id})))) as cases
      from production_stages s where s.laboratory_id = ${ctx.lab.id} order by s.position`;
    // "Getting started" checklist: administrators of real laboratories only. Ticks itself from real data.
    let setup: { trays: boolean; clinics: boolean; prices: boolean; cases: boolean } | null = null;
    if (ctx.isAdmin && !ctx.lab.is_demo) {
      const [r] = await tx<{ trays: boolean; clinics: boolean; prices: boolean; cases: boolean }[]>`
        select exists (select 1 from trays where laboratory_id = ${ctx.lab.id} and is_active) as trays,
               exists (select 1 from clinics where laboratory_id = ${ctx.lab.id}) as clinics,
               exists (select 1 from service_prices where laboratory_id = ${ctx.lab.id}) as prices,
               exists (select 1 from cases where laboratory_id = ${ctx.lab.id}) as cases`;
      setup = r;
    }
    return { ...j, trayMap, pipeline, setup, firstName: ctx.user.fullName.split(" ")[0], isAdmin: ctx.isAdmin, labName: ctx.lab.name, isDemo: ctx.lab.is_demo };
  });
}
