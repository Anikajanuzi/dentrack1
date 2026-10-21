"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { fromZod, type ActionResult } from "./result";

const MAX_TRAY_NUMBER = 9999;

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter the laboratory name").max(120, "Use at most 120 characters"),
    timezone: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
    trayCount: z.number().int().min(0, "Use 0 or more").max(500, "Up to 500 trays at once"),
    trayStart: z.number().int().min(1, "Tray numbers start at 1 or higher").max(MAX_TRAY_NUMBER, "Tray numbers go up to 9999"),
  })
  .refine((v) => v.trayCount === 0 || v.trayStart + v.trayCount - 1 <= MAX_TRAY_NUMBER, {
    path: ["trayCount"],
    message: "The last tray number would be above 9999",
  });

export type CreatedLab = { name: string; trays: { count: number; from: number; to: number } | null };

/**
 * Creates the laboratory and its numbered trays in ONE database transaction: if adding the trays
 * fails, the laboratory, its membership and its default stages/categories are rolled back too, so
 * nothing half-created is left behind. Doesn't redirect: the wizard shows its own final step.
 */
export async function createLaboratoryAction(input: z.input<typeof schema>): Promise<ActionResult<CreatedLab>> {
  const user = await getSessionUser();
  if (!user) redirect("/login?error=session");
  const p = schema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const { name, timezone, currency, trayCount, trayStart } = p.data;
  try {
    await asUser(user.id, async (tx) => {
      const [lab] = await tx<{ id: string }[]>`select create_laboratory(${name}, ${timezone}, ${currency}, 0) as id`;
      if (trayCount > 0) await tx`select add_trays(${lab.id}, ${trayStart}, ${trayStart + trayCount - 1})`;
    });
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
  // No revalidatePath here: refreshing /onboarding now would redirect to the dashboard (the user
  // has a laboratory) and skip the wizard's final step. The dashboard is rendered fresh on arrival.
  return {
    ok: true,
    data: { name: name.trim(), trays: trayCount > 0 ? { count: trayCount, from: trayStart, to: trayStart + trayCount - 1 } : null },
  };
}

/** Opens the demo workspace, creating it the first time. Real laboratories are never touched. */
export async function createDemoAction(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/login?error=session");
  try {
    await asUser(user.id, async (tx) => {
      const [existing] = await tx<{ id: string }[]>`
        select l.id from laboratory_memberships m join laboratories l on l.id = m.laboratory_id
        where m.user_id = ${user.id} and m.is_active and l.is_demo limit 1`;
      if (existing) await tx`select set_active_laboratory(${existing.id})`;
      else await tx`select create_demo_laboratory()`;
    });
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
