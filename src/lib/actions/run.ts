import "server-only";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type Tx } from "@/lib/db";
import { withLab, type AppContext } from "@/lib/auth/context";
import type { ActionResult } from "./result";

/**
 * Execute a mutation as the signed-in user (RLS + database permission checks apply),
 * translate database errors into user-facing messages, and refresh the affected pages.
 */
export async function run<T>(
  fn: (tx: Tx, ctx: AppContext) => Promise<T>,
  opts: { revalidate?: string[]; message?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const data = await withLab(fn);
    // Most screens show live counts (dashboard, tray board, notifications), so refresh the whole app layout.
    revalidatePath("/", "layout");
    for (const p of opts.revalidate ?? []) revalidatePath(p);
    return { ok: true, data, message: opts.message };
  } catch (e) {
    // Next.js redirects/notFound are control flow — rethrow them.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return { ok: false, error: dbErrorMessage(e) };
  }
}
