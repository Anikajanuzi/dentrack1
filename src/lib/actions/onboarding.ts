"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { fromZod, type ActionResult } from "./result";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the laboratory name").max(120),
  timezone: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  trayCount: z.number().int().min(0, "0 or more").max(500, "Up to 500 at once"),
});

export async function createLaboratoryAction(input: z.infer<typeof schema>): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const p = schema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  try {
    await asUser(user.id, (tx) => tx`select create_laboratory(${p.data.name}, ${p.data.timezone}, ${p.data.currency}, ${p.data.trayCount})`);
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard?welcome=1");
}

export async function createDemoAction(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    await asUser(user.id, (tx) => tx`select create_demo_laboratory()`);
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
