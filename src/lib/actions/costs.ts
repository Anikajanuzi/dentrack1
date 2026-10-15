"use server";

import { z } from "zod";
import { run } from "./run";
import { fromZod, type ActionResult } from "./result";

const dec = (max: number, label: string) =>
  z.string().trim().transform((v) => v.replace(",", ".")).refine((v) => new RegExp(`^\\d{1,${max}}(\\.\\d+)?$`).test(v), `Enter a valid ${label}`);

const materialSchema = z.object({
  material_id: z.union([z.literal(""), z.string().uuid()]).optional(),
  material_name: z.string().trim().max(120).optional(),
  unit: z.string().trim().max(20).optional(),
  quantity: dec(9, "quantity").refine((v) => Number(v) > 0, "Quantity must be more than 0").refine((v) => !/\.\d{4,}$/.test(v), "Up to 3 decimals"),
  unit_cost: z.string().trim().optional().transform((v) => (v ? v.replace(",", ".") : undefined))
    .refine((v) => v === undefined || /^\d{1,8}(\.\d{1,4})?$/.test(v), "Enter a cost like 2.50"),
  basis: z.enum(["actual", "estimate"]),
  notes: z.string().trim().max(300).optional(),
});

export async function addMaterialCostAction(caseId: string, input: z.input<typeof materialSchema>): Promise<ActionResult> {
  const p = materialSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  if (!v.material_id && (!v.material_name || !v.unit)) return { ok: false, error: "Choose a catalog material or enter a name and unit.", fieldErrors: { material_name: "Required" } };
  return run((tx) => tx`
    select add_material_cost(${caseId}, ${v.material_id || null}, ${v.material_name || null}, ${v.unit || null},
                             ${v.quantity}, ${v.unit_cost ?? null}, ${v.basis}, null, ${v.notes || null})`.then(() => undefined),
    { message: "Material recorded" });
}

const laborSchema = z.object({
  technician_id: z.union([z.literal(""), z.string().uuid()]).optional(),
  task: z.string().trim().min(1, "Describe the task").max(200),
  entry_type: z.enum(["hours", "manual"]),
  hours: z.string().trim().optional(),
  manual_amount: z.string().trim().optional(),
  rate_override: z.string().trim().optional(),
  basis: z.enum(["actual", "estimate"]),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function addLaborEntryAction(caseId: string, input: z.input<typeof laborSchema>): Promise<ActionResult> {
  const p = laborSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  const num = (s?: string) => (s ? s.replace(",", ".") : null);
  if (v.entry_type === "hours" && !/^\d{1,3}(\.\d{1,2})?$/.test(num(v.hours) ?? "")) return { ok: false, error: "Enter hours like 1.5", fieldErrors: { hours: "Enter hours like 1.5" } };
  if (v.entry_type === "manual" && !/^\d{1,10}(\.\d{1,2})?$/.test(num(v.manual_amount) ?? "")) return { ok: false, error: "Enter an amount", fieldErrors: { manual_amount: "Enter an amount like 20.00" } };
  if (v.rate_override && !/^\d{1,8}(\.\d{1,2})?$/.test(num(v.rate_override) ?? "")) return { ok: false, error: "Enter a valid hourly rate", fieldErrors: { rate_override: "Enter a rate like 8.00" } };
  return run((tx) => tx`
    select add_labor_entry(${caseId}, ${v.technician_id || null}, ${v.task}, ${v.entry_type},
                           ${v.entry_type === "hours" ? num(v.hours) : null}, ${v.entry_type === "manual" ? num(v.manual_amount) : null},
                           ${v.entry_type === "hours" ? num(v.rate_override) : null}, ${v.basis}, ${v.work_date ?? null})`.then(() => undefined),
    { message: "Labor recorded" });
}

const otherSchema = z.object({
  category: z.enum(["outsourcing", "external_milling", "external_scanning", "external_3d_printing", "specialized_finishing",
    "equipment_rental", "logistics", "packaging", "remake", "additional_materials", "external_services", "other"]),
  description: z.string().trim().min(1, "Describe the cost").max(200),
  amount: z.string().trim().transform((v) => v.replace(",", ".")).refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), "Enter an amount like 8.00"),
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  supplier: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(300).optional(),
  basis: z.enum(["actual", "estimate"]),
});

export async function addOtherCostAction(caseId: string, input: z.input<typeof otherSchema>): Promise<ActionResult> {
  const p = otherSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    await tx`
      insert into case_other_direct_costs (laboratory_id, case_id, category, description, amount, cost_date, supplier, notes, basis, created_by)
      values (${ctx.lab.id}, ${caseId}, ${v.category}, ${v.description}, ${v.amount}, ${v.cost_date}, ${v.supplier || null}, ${v.notes || null}, ${v.basis}, ${ctx.user.id})`;
  }, { message: "Cost recorded" });
}

const TABLES = { material: "case_material_costs", labor: "case_labor_entries", other: "case_other_direct_costs" } as const;

export async function deleteCostAction(kind: keyof typeof TABLES, id: string): Promise<ActionResult> {
  if (!(kind in TABLES) || !z.string().uuid().safeParse(id).success) return { ok: false, error: "Entry not found" };
  return run(async (tx) => {
    const r = await tx`delete from ${tx(TABLES[kind])} where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Cost recording permission required"), { code: "42501" });
  }, { message: "Entry removed" });
}

export async function setSectionConfirmedAction(caseId: string, section: "materials" | "labor" | "other", confirmed: boolean): Promise<ActionResult> {
  return run((tx) => tx`select set_cost_section_confirmed(${caseId}, ${section}, ${confirmed})`.then(() => undefined));
}

export async function updatePricingAction(caseId: string, input: { selling_price: string; discount: string; estimated: string }): Promise<ActionResult> {
  const m = (v: string) => (v.trim() === "" ? null : v.trim().replace(",", "."));
  const vals = [m(input.selling_price), m(input.discount), m(input.estimated)];
  if (vals.some((v) => v !== null && !/^\d{1,10}(\.\d{1,2})?$/.test(v))) return { ok: false, error: "Enter amounts like 120.00" };
  return run((tx) => tx`select update_case_pricing(${caseId}, ${vals[0]}, ${vals[1] ?? "0"}, ${vals[2]})`.then(() => undefined), {
    message: "Pricing saved",
  });
}
