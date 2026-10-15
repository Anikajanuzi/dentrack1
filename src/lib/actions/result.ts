import type { ZodError } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fromZod(e: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Check the highlighted fields.", fieldErrors };
}
