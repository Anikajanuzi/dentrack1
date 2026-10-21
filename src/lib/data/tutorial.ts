import "server-only";
import { asUser, type Tx } from "@/lib/db";
import { EMPTY_TUTORIAL, type TutorialState, type TutorialStatus } from "@/lib/tutorial/types";

// Migration 0008 is applied by hand on Supabase. Until it is, the table doesn't exist and the
// tutorial keeps progress in the browser. Only a positive answer is cached, so applying the
// migration takes effect without a redeploy.
let tableKnownToExist = false;

export async function tutorialTableExists(tx: Tx): Promise<boolean> {
  if (tableKnownToExist) return true;
  const [r] = await tx<{ t: string | null }[]>`select to_regclass('public.tutorial_progress')::text as t`;
  tableKnownToExist = Boolean(r?.t);
  return tableKnownToExist;
}

/** Tour progress for this user in this laboratory. Never throws: falls back to "not stored". */
export async function getTutorialState(userId: string, labId: string): Promise<TutorialState> {
  try {
    return await asUser(userId, async (tx) => {
      if (!(await tutorialTableExists(tx))) return EMPTY_TUTORIAL;
      const rows = await tx<{ laboratory_id: string; status: TutorialStatus; step: number; checklist_dismissed: boolean }[]>`
        select laboratory_id, status, step, checklist_dismissed from tutorial_progress where user_id = ${userId}`;
      const here = rows.find((r) => r.laboratory_id === labId);
      return {
        stored: true,
        status: here?.status ?? "not_started",
        step: here?.step ?? 0,
        checklistDismissed: here?.checklist_dismissed ?? false,
        completedElsewhere: rows.some((r) => r.laboratory_id !== labId && r.status === "completed"),
      };
    });
  } catch (e) {
    console.error("[dentrack] tutorial state unavailable:", e instanceof Error ? e.message : e);
    return EMPTY_TUTORIAL;
  }
}
