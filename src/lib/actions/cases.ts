"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "./run";
import { fromZod, type ActionResult } from "./result";
import { caseSchema, date, type CaseInput } from "@/lib/validation/case";

const uuid = z.string().uuid();
export async function createCaseAction(input: CaseInput): Promise<ActionResult<string>> {
  const p = caseSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const payload = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined && v !== ""));
  const r = await run(async (tx, ctx) => {
    const [row] = await tx<{ id: string }[]>`select create_case(${ctx.lab.id}, ${tx.json(payload)}) as id`;
    return row.id;
  });
  if (r.ok && r.data) redirect(`/cases/${r.data}?created=1`);
  return r;
}

const editableSchema = z.object({
  reference: z.string().trim().min(1).max(40).optional(),
  patient_id: z.string().uuid().optional(),
  clinic_id: z.string().uuid().optional(),
  dentist_id: z.union([z.literal(""), z.string().uuid()]).optional(),
  category_id: z.string().uuid().optional(),
  service_id: z.union([z.literal(""), z.string().uuid()]).optional(),
  technician_id: z.union([z.literal(""), z.string().uuid()]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  units: z.coerce.number().int().min(1).max(64).optional(),
  tooth_numbers: z.string().trim().max(120).optional(),
  shade: z.string().trim().max(40).optional(),
  received_date: date.optional(),
  due_date: date.optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function updateCaseAction(caseId: string, input: z.input<typeof editableSchema>): Promise<ActionResult> {
  if (!uuid.safeParse(caseId).success) return { ok: false, error: "Case not found" };
  const p = editableSchema.safeParse(input);
  if (!p.success) return fromZod(p.error);
  const payload = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined));
  return run((tx) => tx`select update_case(${caseId}, ${tx.json(payload)})`.then(() => undefined), { message: "Case updated" });
}

export async function moveStageAction(caseId: string, stageId: string, note?: string): Promise<ActionResult> {
  if (!uuid.safeParse(caseId).success || !uuid.safeParse(stageId).success) return { ok: false, error: "Choose a stage" };
  return run((tx) => tx`select move_case_stage(${caseId}, ${stageId}, ${note?.trim() || null})`.then(() => undefined));
}

export async function cancelCaseAction(caseId: string, reason: string): Promise<ActionResult> {
  return run((tx) => tx`select cancel_case(${caseId}, ${reason})`.then(() => undefined), { message: "Case cancelled" });
}

export async function archiveCaseAction(caseId: string): Promise<ActionResult> {
  return run((tx) => tx`select archive_case(${caseId})`.then(() => undefined), { message: "Case archived" });
}

export async function restoreCaseAction(caseId: string): Promise<ActionResult> {
  return run((tx) => tx`select restore_case(${caseId})`.then(() => undefined), { message: "Case restored" });
}

export async function addNoteAction(caseId: string, body: string): Promise<ActionResult> {
  const b = body.trim();
  if (!b) return { ok: false, error: "Write a note first." };
  if (b.length > 4000) return { ok: false, error: "Notes can be up to 4000 characters." };
  return run((tx) => tx`select add_case_note(${caseId}, ${b})`.then(() => undefined), { message: "Note added" });
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`delete from case_notes where id = ${noteId}`;
    if (r.count === 0) throw Object.assign(new Error("You can only delete your own notes"), { code: "42501" });
  }, { message: "Note deleted" });
}

export async function uploadFileAction(caseId: string, form: FormData): Promise<ActionResult> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Files must be 10 MB or smaller." };
  const bytes = Buffer.from(await file.arrayBuffer());
  return run((tx) => tx`select add_case_attachment(${caseId}, ${file.name}, ${file.type || null}, ${bytes})`.then(() => undefined), {
    message: "File uploaded",
  });
}

export async function deleteFileAction(fileId: string): Promise<ActionResult> {
  return run(async (tx) => {
    const r = await tx`delete from case_attachments where id = ${fileId}`;
    if (r.count === 0) throw Object.assign(new Error("You can only delete files you uploaded"), { code: "42501" });
  }, { message: "File deleted" });
}

export async function assignCaseTrayAction(caseId: string, trayId: string): Promise<ActionResult> {
  return run((tx) => tx`select assign_tray(${trayId}, ${caseId})`.then(() => undefined), { message: "Case placed in tray" });
}
