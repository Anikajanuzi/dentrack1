"use server";

import { z } from "zod";
import { run } from "./run";
import { fromZod, type ActionResult } from "./result";

const denied = () => Object.assign(new Error("Administrator permission required"), { code: "42501" });
const money = (label: string, dp = 2) =>
  z.string().trim().transform((v) => v.replace(",", ".")).refine((v) => new RegExp(`^\\d{1,10}(\\.\\d{1,${dp}})?$`).test(v), `Enter ${label}`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const labSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contact_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300),
  logo_url: z.union([z.literal(""), z.string().trim().url("Enter a full https:// URL").startsWith("https://", "Use an https:// URL")]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().min(1).max(64),
  date_format: z.enum(["dd MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  due_soon_days: z.coerce.number().int().min(0).max(30),
});

export async function updateLabAction(input: z.input<typeof labSchema>): Promise<ActionResult> {
  const p = labSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    await tx`select now() at time zone ${v.timezone}`; // validates the timezone name
    const r = await tx`update laboratories set name = ${v.name}, contact_email = ${v.contact_email || null}, phone = ${v.phone || null},
      address = ${v.address || null}, logo_url = ${v.logo_url || null}, currency = ${v.currency}, timezone = ${v.timezone},
      date_format = ${v.date_format}, due_soon_days = ${v.due_soon_days} where id = ${ctx.lab.id}`;
    if (r.count === 0) throw denied();
  }, { message: "Laboratory settings saved" });
}

export async function saveNotificationPrefsAction(prefs: Record<string, boolean>): Promise<ActionResult> {
  const allowed = ["due_soon", "overdue", "assignment", "status_change", "case_completed", "tray_reassigned"];
  const clean = Object.fromEntries(Object.entries(prefs).filter(([k, v]) => allowed.includes(k) && typeof v === "boolean"));
  return run(async (tx, ctx) => {
    await tx`update laboratory_memberships set notification_prefs = ${tx.json(clean)} where laboratory_id = ${ctx.lab.id} and user_id = ${ctx.user.id}`;
  }, { message: "Notification preferences saved" });
}

// Categories
export async function saveCategoryAction(id: string | null, name: string): Promise<ActionResult> {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return { ok: false, error: "Use 2–80 characters" };
  return run(async (tx, ctx) => {
    const r = id
      ? await tx`update prosthetic_categories set name = ${n} where id = ${id}`
      : await tx`insert into prosthetic_categories (laboratory_id, name, position)
                 values (${ctx.lab.id}, ${n}, (select coalesce(max(position), 0) + 1 from prosthetic_categories where laboratory_id = ${ctx.lab.id}))`;
    if (r.count === 0) throw denied();
  }, { message: id ? "Category renamed" : "Category added" });
}
export async function toggleCategoryAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async (tx) => { const r = await tx`update prosthetic_categories set is_active = ${active} where id = ${id}`; if (r.count === 0) throw denied(); });
}

// Services & prices
const serviceSchema = z.object({ name: z.string().trim().min(2, "Enter a name").max(120), category_id: z.string().uuid("Choose a category") });
export async function saveServiceAction(id: string | null, input: z.input<typeof serviceSchema>, price?: { price: string; effective_from: string }): Promise<ActionResult> {
  const p = serviceSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const pr = price?.price ? z.object({ price: money("a price like 120.00"), effective_from: date }).safeParse(price) : null;
  if (pr && !pr.success) return fromZod(pr.error);
  return run(async (tx, ctx) => {
    let sid = id;
    if (id) {
      const r = await tx`update services set name = ${p.data.name}, category_id = ${p.data.category_id} where id = ${id}`;
      if (r.count === 0) throw denied();
    } else {
      const [r] = await tx<{ id: string }[]>`insert into services (laboratory_id, category_id, name) values (${ctx.lab.id}, ${p.data.category_id}, ${p.data.name}) returning id`;
      sid = r.id;
    }
    if (pr?.success) {
      await tx`insert into service_prices (laboratory_id, service_id, price, effective_from, created_by)
               values (${ctx.lab.id}, ${sid}, ${pr.data.price}, ${pr.data.effective_from}, ${ctx.user.id})
               on conflict (service_id, effective_from) do update set price = excluded.price`;
    }
  }, { message: id ? "Service saved" : "Service added" });
}
export async function addServicePriceAction(serviceId: string, price: string, effectiveFrom: string): Promise<ActionResult> {
  const pr = z.object({ price: money("a price like 120.00"), effective_from: date }).safeParse({ price, effective_from: effectiveFrom });
  if (!pr.success) return fromZod(pr.error);
  return run(async (tx, ctx) => {
    await tx`insert into service_prices (laboratory_id, service_id, price, effective_from, created_by)
             values (${ctx.lab.id}, ${serviceId}, ${pr.data.price}, ${pr.data.effective_from}, ${ctx.user.id})
             on conflict (service_id, effective_from) do update set price = excluded.price`;
  }, { message: "Price saved. Existing cases keep the price they were created with." });
}
export async function toggleServiceAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async (tx) => { const r = await tx`update services set is_active = ${active} where id = ${id}`; if (r.count === 0) throw denied(); });
}

// Material catalog
const materialSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  unit: z.string().trim().min(1, "Enter a unit").max(20),
  default_unit_cost: z.union([z.literal(""), money("a cost like 0.95", 4)]),
});
export async function saveMaterialAction(id: string | null, input: z.input<typeof materialSchema>): Promise<ActionResult> {
  const p = materialSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    const r = id
      ? await tx`update material_catalog set name = ${v.name}, unit = ${v.unit}, default_unit_cost = ${v.default_unit_cost || null} where id = ${id}`
      : await tx`insert into material_catalog (laboratory_id, name, unit, default_unit_cost) values (${ctx.lab.id}, ${v.name}, ${v.unit}, ${v.default_unit_cost || null})`;
    if (r.count === 0) throw denied();
  }, { message: "Material saved. Costs already recorded on cases are unchanged." });
}
export async function toggleMaterialAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async (tx) => { const r = await tx`update material_catalog set is_active = ${active} where id = ${id}`; if (r.count === 0) throw denied(); });
}

// Labor rates
export async function addLaborRateAction(technicianId: string, rate: string, effectiveFrom: string): Promise<ActionResult> {
  const p = z.object({ rate: money("a rate like 8.00"), effective_from: date }).safeParse({ rate, effective_from: effectiveFrom });
  if (!p.success) return fromZod(p.error);
  return run(async (tx, ctx) => {
    await tx`insert into labor_rates (laboratory_id, technician_id, hourly_rate, effective_from, created_by)
             values (${ctx.lab.id}, ${technicianId || null}, ${p.data.rate}, ${p.data.effective_from}, ${ctx.user.id})`;
  }, { message: "Labor rate saved" });
}

// Production stages (custom stages sit between Received and Completed)
export async function addStageAction(name: string): Promise<ActionResult> {
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return { ok: false, error: "Use 2–60 characters" };
  return run(async (tx, ctx) => {
    const r = await tx`insert into production_stages (laboratory_id, name, position)
      select ${ctx.lab.id}, ${n}, max(position) + 1 from production_stages
      where laboratory_id = ${ctx.lab.id} and (system_key is null or system_key = 'received')`;
    if (r.count === 0) throw denied();
  }, { message: "Stage added" });
}
export async function renameStageAction(id: string, name: string): Promise<ActionResult> {
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return { ok: false, error: "Use 2–60 characters" };
  return run(async (tx) => { const r = await tx`update production_stages set name = ${n} where id = ${id}`; if (r.count === 0) throw denied(); }, { message: "Stage renamed" });
}
export async function moveStageOrderAction(id: string, dir: -1 | 1): Promise<ActionResult> {
  return run(async (tx, ctx) => {
    const stages = await tx<{ id: string; position: number; system_key: string | null }[]>`
      select id, position, system_key::text from production_stages where laboratory_id = ${ctx.lab.id} and system_key is null order by position`;
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length) return;
    await tx`update production_stages set position = ${stages[j].position} where id = ${stages[i].id}`;
    await tx`update production_stages set position = ${stages[i].position} where id = ${stages[j].id}`;
  });
}
export async function deleteStageAction(id: string): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`delete from production_stages where id = ${id} and system_key is null
      and not exists (select 1 from cases where stage_id = ${id})
      and not exists (select 1 from case_status_history where to_stage_id = ${id} or from_stage_id = ${id})`;
    if (r.count === 0) throw Object.assign(new Error("This stage has case history, so it can't be deleted. Rename it instead."), { code: "P0001" });
  }, { message: "Stage deleted" });
}
