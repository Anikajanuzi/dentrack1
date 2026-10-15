"use server";

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { run } from "./run";
import { fromZod, type ActionResult } from "./result";

const techSchema = z.object({ full_name: z.string().trim().min(2, "Enter a name").max(120), job_title: z.string().trim().max(80).optional() });

export async function saveTechnicianAction(id: string | null, input: z.input<typeof techSchema>): Promise<ActionResult> {
  const p = techSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  return run(async (tx, ctx) => {
    const r = id
      ? await tx`update technicians set full_name = ${p.data.full_name}, job_title = ${p.data.job_title || null} where id = ${id}`
      : await tx`insert into technicians (laboratory_id, full_name, job_title) values (${ctx.lab.id}, ${p.data.full_name}, ${p.data.job_title || null})`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: id ? "Technician saved" : "Technician added" });
}

export async function setTechnicianActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`update technicians set is_active = ${active} where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: active ? "Technician reactivated" : "Technician deactivated" });
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["admin", "technician"]),
  can_manage_costs: z.boolean(),
  technician_id: z.union([z.literal(""), z.string().uuid()]).optional(),
});

export async function inviteMemberAction(input: z.input<typeof inviteSchema>): Promise<ActionResult<{ emailed: boolean }>> {
  const p = inviteSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const v = p.data;
  const r = await run(async (tx, ctx) => {
    const [existing] = await tx<{ id: string }[]>`
      select m.id from laboratory_memberships m join profiles pr on pr.id = m.user_id
      where m.laboratory_id = ${ctx.lab.id} and lower(pr.email) = ${v.email}`;
    if (existing) throw Object.assign(new Error("This person is already a member of the laboratory"), { code: "P0001" });
    await tx`insert into lab_invitations (laboratory_id, email, role, can_manage_costs, technician_id, invited_by)
             values (${ctx.lab.id}, ${v.email}, ${v.role}, ${v.can_manage_costs || v.role === "admin"}, ${v.technician_id || null}, ${ctx.user.id})`;
    return { emailed: false };
  });
  if (!r.ok) return r;
  // Supabase can email the invitation when a service-role key is configured (server-side only).
  if (env.authProvider === "supabase" && env.supabaseServiceRoleKey) {
    const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.inviteUserByEmail(v.email, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });
    if (!error) return { ok: true, data: { emailed: true }, message: `Invitation emailed to ${v.email}` };
  }
  return { ok: true, data: { emailed: false }, message: `Invitation saved. Ask ${v.email} to create an account with this email.` };
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`delete from lab_invitations where id = ${id} and accepted_at is null`;
    if (r.count === 0) throw Object.assign(new Error("Invitation not found"), { code: "P0002" });
  }, { message: "Invitation revoked" });
}

export async function updateMemberAction(id: string, patch: { role?: "admin" | "technician"; can_manage_costs?: boolean; is_active?: boolean }): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`update laboratory_memberships set
      role = coalesce(${patch.role ?? null}::member_role, role),
      can_manage_costs = coalesce(${patch.can_manage_costs ?? null}, can_manage_costs),
      is_active = coalesce(${patch.is_active ?? null}, is_active)
      where id = ${id}`;
    if (r.count === 0) throw Object.assign(new Error("Administrator permission required"), { code: "42501" });
  }, { message: "Member updated" });
}
