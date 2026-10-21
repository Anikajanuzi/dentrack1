"use server";

import { z } from "zod";
import { withLab } from "@/lib/auth/context";
import { tutorialTableExists } from "@/lib/data/tutorial";
import { TUTORIAL_STATUSES } from "@/lib/tutorial/types";
import type { ActionResult } from "./result";

// These actions only record progress. They never redirect or revalidate, so saving can't
// trigger navigation (the tour drives its own navigation on the client).

const progress = z.object({
  status: z.enum(TUTORIAL_STATUSES as [string, ...string[]]),
  step: z.number().int().min(0).max(50),
});

export async function saveTutorialAction(input: z.infer<typeof progress>): Promise<ActionResult<{ stored: boolean }>> {
  const p = progress.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid tutorial progress" };
  try {
    return await withLab(async (tx, ctx) => {
      if (!(await tutorialTableExists(tx))) return { ok: true, data: { stored: false } };
      await tx`
        insert into tutorial_progress (user_id, laboratory_id, status, step, updated_at)
        values (${ctx.user.id}, ${ctx.lab.id}, ${p.data.status}, ${p.data.step}, now())
        on conflict (user_id, laboratory_id)
        do update set status = excluded.status, step = excluded.step, updated_at = now()`;
      return { ok: true, data: { stored: true } };
    });
  } catch (e) {
    console.error("[dentrack] saving tutorial progress failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't save tutorial progress" };
  }
}

export async function setChecklistDismissedAction(dismissed: boolean): Promise<ActionResult<{ stored: boolean }>> {
  try {
    return await withLab(async (tx, ctx) => {
      if (!(await tutorialTableExists(tx))) return { ok: true, data: { stored: false } };
      await tx`
        insert into tutorial_progress (user_id, laboratory_id, checklist_dismissed, updated_at)
        values (${ctx.user.id}, ${ctx.lab.id}, ${dismissed === true}, now())
        on conflict (user_id, laboratory_id)
        do update set checklist_dismissed = excluded.checklist_dismissed, updated_at = now()`;
      return { ok: true, data: { stored: true } };
    });
  } catch (e) {
    console.error("[dentrack] saving checklist preference failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't save this preference" };
  }
}
