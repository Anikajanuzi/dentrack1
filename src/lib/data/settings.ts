import "server-only";
import { withLab } from "@/lib/auth/context";

export async function getSettings() {
  return withLab(async (tx, ctx) => {
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const [membership] = await tx<{ notification_prefs: Record<string, boolean> }[]>`
      select notification_prefs from laboratory_memberships where laboratory_id = ${ctx.lab.id} and user_id = ${ctx.user.id}`;
    const categories = await tx<{ id: string; name: string; position: number; is_active: boolean; services: number }[]>`
      select c.id, c.name, c.position, c.is_active, (select count(*)::int from services s where s.category_id = c.id) as services
      from prosthetic_categories c where c.laboratory_id = ${ctx.lab.id} order by c.position, c.name`;
    const stages = await tx<{ id: string; name: string; position: number; system_key: string | null; in_use: number }[]>`
      select s.id, s.name, s.position, s.system_key::text, (select count(*)::int from cases c where c.stage_id = s.id) + (select count(*)::int from case_status_history h where h.to_stage_id = s.id or h.from_stage_id = s.id) as in_use
      from production_stages s where s.laboratory_id = ${ctx.lab.id} order by s.position`;
    const trays = await tx<{ id: string; number: number; label: string | null; is_active: boolean; uses: number }[]>`
      select t.id, t.number, t.label, t.is_active, (select count(*)::int from tray_assignments a where a.tray_id = t.id) as uses
      from trays t where t.laboratory_id = ${ctx.lab.id} order by t.number`;
    let admin = null;
    if (ctx.isAdmin) {
      const services = await tx<{ id: string; name: string; category_id: string; category: string; is_active: boolean; price: string | null; price_from: string | null; history: { price: string; effective_from: string }[] }[]>`
        select s.id, s.name, s.category_id, c.name as category, s.is_active,
          (select price::text from service_prices p where p.service_id = s.id and p.effective_from <= ${today}::date order by effective_from desc limit 1) as price,
          (select effective_from::text from service_prices p where p.service_id = s.id and p.effective_from <= ${today}::date order by effective_from desc limit 1) as price_from,
          coalesce((select json_agg(json_build_object('price', p.price::text, 'effective_from', p.effective_from) order by p.effective_from desc) from service_prices p where p.service_id = s.id), '[]') as history
        from services s join prosthetic_categories c on c.id = s.category_id where s.laboratory_id = ${ctx.lab.id} order by c.position, s.name`;
      const materials = await tx<{ id: string; name: string; unit: string; default_unit_cost: string | null; is_active: boolean; updated_at: string }[]>`
        select id, name, unit, default_unit_cost::text, is_active, updated_at from material_catalog where laboratory_id = ${ctx.lab.id} order by is_active desc, name`;
      const rates = await tx<{ id: string; technician_id: string | null; technician: string | null; hourly_rate: string; effective_from: string }[]>`
        select r.id, r.technician_id, t.full_name as technician, r.hourly_rate::text, r.effective_from
        from labor_rates r left join technicians t on t.id = r.technician_id where r.laboratory_id = ${ctx.lab.id}
        order by t.full_name nulls first, r.effective_from desc`;
      const technicians = await tx<{ id: string; full_name: string }[]>`select id, full_name from technicians where laboratory_id = ${ctx.lab.id} and is_active order by full_name`;
      admin = { services, materials, rates, technicians };
    }
    return { today, lab: ctx.lab, user: ctx.user, isAdmin: ctx.isAdmin, canManageCosts: ctx.canManageCosts, prefs: membership?.notification_prefs ?? {}, categories, stages, trays, admin };
  });
}
