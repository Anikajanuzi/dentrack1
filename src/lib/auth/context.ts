import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asUser, type Tx } from "@/lib/db";
import { getSessionUser, type SessionUser } from "./session";

export type Role = "admin" | "technician";

export interface Lab {
  id: string;
  name: string;
  is_demo: boolean;
  currency: string;
  timezone: string;
  date_format: string;
  due_soon_days: number;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
}

export interface AppContext {
  user: SessionUser & { fullName: string; theme: "light" | "dark" | "system"; reducedMotion: boolean };
  lab: Lab;
  role: Role;
  isAdmin: boolean;
  canManageCosts: boolean;
  technicianId: string | null;
  labs: Array<{ id: string; name: string; is_demo: boolean; role: Role }>;
}

/** Load identity, active laboratory and permissions. Redirects when signed out / not onboarded. */
export const getContext = cache(async (): Promise<AppContext> => {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const data = await asUser(session.id, async (tx) => {
    const [profile] = await tx<{ full_name: string | null; theme: string; reduced_motion: boolean; active_laboratory_id: string | null }[]>`
      select full_name, theme, reduced_motion, active_laboratory_id from profiles where id = ${session.id}`;
    const memberships = await tx<Array<{ id: string; name: string; is_demo: boolean; role: Role; can_manage_costs: boolean }>>`
      select l.id, l.name, l.is_demo, m.role, m.can_manage_costs
      from laboratory_memberships m join laboratories l on l.id = m.laboratory_id
      where m.user_id = ${session.id} and m.is_active
      order by l.is_demo, l.name`;
    return { profile, memberships };
  });

  if (!data.profile) redirect("/login?error=profile");
  if (data.memberships.length === 0) redirect("/onboarding");

  const active =
    data.memberships.find((m) => m.id === data.profile.active_laboratory_id) ?? data.memberships[0];

  const { lab, technicianId } = await asUser(session.id, async (tx) => {
    const [lab] = await tx<Lab[]>`
      select id, name, is_demo, currency, timezone, date_format, due_soon_days, contact_email, phone, address, logo_url
      from laboratories where id = ${active.id}`;
    const [tech] = await tx<{ id: string }[]>`select id from technicians where laboratory_id = ${active.id} and user_id = ${session.id}`;
    return { lab, technicianId: tech?.id ?? null };
  });

  return {
    user: {
      ...session,
      fullName: data.profile.full_name ?? session.email,
      theme: (data.profile.theme as AppContext["user"]["theme"]) ?? "system",
      reducedMotion: data.profile.reduced_motion,
    },
    lab,
    role: active.role,
    isAdmin: active.role === "admin",
    canManageCosts: active.role === "admin" || active.can_manage_costs,
    technicianId,
    labs: data.memberships.map(({ id, name, is_demo, role }) => ({ id, name, is_demo, role })),
  };
});

/** Run queries as the current user against their active laboratory. */
export async function withLab<T>(fn: (tx: Tx, ctx: AppContext) => Promise<T>): Promise<T> {
  const ctx = await getContext();
  return asUser(ctx.user.id, (tx) => fn(tx, ctx));
}

export async function requireAdmin(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx.isAdmin) redirect("/dashboard?denied=1");
  return ctx;
}
