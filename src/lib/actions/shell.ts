"use server";

import { z } from "zod";
import { withLab } from "@/lib/auth/context";
import { run } from "./run";
import type { ActionResult } from "./result";

export interface SearchResults {
  cases?: { id: string; reference: string; lifecycle: string; due_date: string; patient: string | null; archived: boolean }[];
  trays?: { id: string; number: number; case_reference: string | null; is_active: boolean }[];
  patients?: { id: string; reference: string; full_name: string | null }[];
  clinics?: { id: string; name: string }[];
  services?: { id: string; name: string }[];
}

/** Global search. Runs with the user's own permissions: RLS decides what can be found. */
export async function globalSearchAction(q: string): Promise<SearchResults> {
  const query = q.slice(0, 80);
  if (!query.trim()) return {};
  return withLab(async (tx, ctx) => {
    const [r] = await tx<{ j: SearchResults }[]>`select global_search(${ctx.lab.id}, ${query}) as j`;
    return r.j;
  });
}

export async function markNotificationsReadAction(ids: string[] | null): Promise<ActionResult> {
  if (ids && !z.array(z.string().uuid()).safeParse(ids).success) return { ok: false, error: "Invalid notification" };
  return run((tx) => tx`select mark_notifications_read(${ids})`.then(() => undefined));
}

export async function switchLabAction(labId: string): Promise<ActionResult> {
  return run((tx) => tx`select set_active_laboratory(${labId})`.then(() => undefined));
}

export async function savePreferencesAction(input: { theme?: "light" | "dark" | "system"; reducedMotion?: boolean; fullName?: string }): Promise<ActionResult> {
  const p = z
    .object({ theme: z.enum(["light", "dark", "system"]).optional(), reducedMotion: z.boolean().optional(), fullName: z.string().trim().min(2).max(120).optional() })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid preference" };
  return run(async (tx, ctx) => {
    await tx`update profiles set
      theme = coalesce(${p.data.theme ?? null}, theme),
      reduced_motion = coalesce(${p.data.reducedMotion ?? null}, reduced_motion),
      full_name = coalesce(${p.data.fullName ?? null}, full_name)
      where id = ${ctx.user.id}`;
  }, { message: "Preferences saved" });
}
