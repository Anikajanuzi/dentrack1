"use server";

import { z } from "zod";
import { run } from "./run";
import { fromZod, type ActionResult } from "./result";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const clinicSchema = z.object({
  name: z.string().trim().min(2, "Enter the clinic name").max(160),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional().transform((v) => v || null),
  phone: opt(40),
  address: opt(300),
  notes: opt(1000),
});

export async function saveClinicAction(id: string | null, input: z.input<typeof clinicSchema>): Promise<ActionResult<string>> {
  const p = clinicSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  return run(async (tx, ctx) => {
    if (id) {
      const r = await tx`update clinics set name = ${v.name}, email = ${v.email}, phone = ${v.phone}, address = ${v.address}, notes = ${v.notes} where id = ${id}`;
      if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
      return id;
    }
    const [r] = await tx<{ id: string }[]>`insert into clinics (laboratory_id, name, email, phone, address, notes) values (${ctx.lab.id}, ${v.name}, ${v.email}, ${v.phone}, ${v.address}, ${v.notes}) returning id`;
    return r.id;
  }, { message: id ? "Clinic saved" : "Clinic added" });
}

export async function setClinicActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`update clinics set is_active = ${active} where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: active ? "Clinic reactivated" : "Clinic deactivated" });
}

const dentistSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the dentist's name").max(120),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional().transform((v) => v || null),
  phone: opt(40),
});

export async function addDentistAction(clinicId: string, input: z.input<typeof dentistSchema>): Promise<ActionResult> {
  const p = dentistSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  return run(async (tx, ctx) => {
    await tx`insert into dentists (laboratory_id, clinic_id, full_name, email, phone) values (${ctx.lab.id}, ${clinicId}, ${p.data.full_name}, ${p.data.email}, ${p.data.phone})`;
  }, { message: "Dentist added" });
}

export async function removeDentistAction(id: string): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`delete from dentists where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: "Dentist removed" });
}

export async function updatePatientAction(id: string, input: { full_name?: string; notes?: string; clinic_id?: string }): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`update patients set full_name = ${input.full_name?.trim() || null}, notes = ${input.notes?.trim() || null},
                       clinic_id = ${input.clinic_id || null} where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: "Patient saved" });
}
