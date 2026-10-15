import "server-only";
import { withLab } from "@/lib/auth/context";
import { resolvePeriod } from "@/lib/period";

export async function getAnalytics(sp: Record<string, string | undefined>) {
  return withLab(async (tx, ctx) => {
    const [{ today }] = await tx<{ today: string }[]>`select lab_today(${ctx.lab.id})::text as today`;
    const period = resolvePeriod(today, sp);
    const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
    const filters = { category: uuid(sp.category), clinic: uuid(sp.clinic), technician: uuid(sp.technician) };
    const [{ j: production }] = await tx<{ j: Record<string, unknown> }[]>`select production_analytics(${ctx.lab.id}, ${period.from}, ${period.to}) as j`;
    const finance = ctx.isAdmin
      ? (await tx<{ j: Record<string, unknown> }[]>`select financial_analytics(${ctx.lab.id}, ${period.from}, ${period.to}, ${filters.category}, ${filters.clinic}, ${filters.technician}) as j`)[0].j
      : null;
    const options = {
      categories: await tx<{ id: string; name: string }[]>`select id, name from prosthetic_categories where laboratory_id = ${ctx.lab.id} order by position`,
      clinics: await tx<{ id: string; name: string }[]>`select id, name from clinics where laboratory_id = ${ctx.lab.id} order by name`,
      technicians: await tx<{ id: string; full_name: string }[]>`select id, full_name from technicians where laboratory_id = ${ctx.lab.id} order by full_name`,
    };
    return { today, period, filters, production, finance, options, isAdmin: ctx.isAdmin, currency: ctx.lab.currency, canManageCosts: ctx.canManageCosts };
  });
}
