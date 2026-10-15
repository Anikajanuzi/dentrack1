"use server";

import { z } from "zod";
import { run } from "./run";
import type { ActionResult } from "./result";
import { getTrayHistory } from "@/lib/data/trays";

const uuid = z.string().uuid();

export async function assignTrayAction(trayId: string, caseId: string): Promise<ActionResult> {
  if (!uuid.safeParse(trayId).success || !uuid.safeParse(caseId).success) return { ok: false, error: "Choose a tray and a case." };
  return run((tx) => tx`select assign_tray(${trayId}, ${caseId})`.then(() => undefined), { message: "Case placed in tray" });
}

export async function releaseTrayAction(trayId: string, confirmEmpty: boolean, reason?: string): Promise<ActionResult> {
  if (!uuid.safeParse(trayId).success) return { ok: false, error: "Tray not found." };
  if (!confirmEmpty) return { ok: false, error: "Confirm the tray is physically empty first." };
  return run((tx) => tx`select release_tray(${trayId}, ${confirmEmpty}, ${reason?.trim() || null})`.then(() => undefined), {
    message: "Tray released",
  });
}

export async function moveCaseAction(caseId: string, trayId: string, confirmOldEmpty: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(trayId).success || !uuid.safeParse(caseId).success) return { ok: false, error: "Choose a tray." };
  return run((tx) => tx`select move_case_to_tray(${caseId}, ${trayId}, ${confirmOldEmpty})`.then(() => undefined), {
    message: "Case moved",
  });
}

export async function setTrayActiveAction(trayId: string, active: boolean): Promise<ActionResult> {
  return run((tx) => tx`select set_tray_active(${trayId}, ${active})`.then(() => undefined), {
    message: active ? "Tray reactivated" : "Tray deactivated",
  });
}

export async function updateTrayLabelAction(trayId: string, label: string): Promise<ActionResult> {
  const l = label.trim().slice(0, 60) || null;
  return run(async (tx) => {
    const r = await tx`update trays set label = ${l} where id = ${trayId}`;
    if (r.count === 0) throw Object.assign(new Error("Only administrators can edit tray labels"), { code: "42501" });
  }, { message: "Label saved" });
}

export async function addTraysAction(from: number, to: number): Promise<ActionResult<number>> {
  const p = z.object({ from: z.number().int().min(1).max(9999), to: z.number().int().min(1).max(9999) }).safeParse({ from, to });
  if (!p.success || to < from) return { ok: false, error: "Enter a valid range, e.g. 25 to 36." };
  return run(async (tx, ctx) => {
    const [r] = await tx<{ n: number }[]>`select add_trays(${ctx.lab.id}, ${from}, ${to}) as n`;
    return r.n;
  });
}

export async function trayHistoryAction(trayId: string) {
  return getTrayHistory(trayId);
}
