import { z } from "zod";

export const optUuid = z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || undefined);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
export const money = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v.replace(",", ".")))
  .refine((v) => v === undefined || /^\d{1,10}(\.\d{1,2})?$/.test(v), "Enter an amount like 120.00");

export const caseSchema = z
  .object({
    reference: z.string().trim().max(40).optional(),
    patient_id: optUuid,
    patient_reference: z.string().trim().max(60).optional(),
    patient_name: z.string().trim().max(120).optional(),
    clinic_id: z.string().uuid("Choose a clinic"),
    dentist_id: optUuid,
    category_id: z.string().uuid("Choose a category"),
    service_id: optUuid,
    technician_id: optUuid,
    tray_id: optUuid,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    units: z.coerce.number().int().min(1).max(64),
    tooth_numbers: z.string().trim().max(120).optional(),
    shade: z.string().trim().max(40).optional(),
    received_date: date,
    due_date: date,
    selling_price: money,
    discount_amount: money,
    estimated_direct_cost: money,
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.patient_id || v.patient_reference, { message: "Choose a patient or enter a new reference", path: ["patient_reference"] })
  .refine((v) => v.due_date >= v.received_date, { message: "Due date can't be before the date received", path: ["due_date"] });

export type CaseInput = z.input<typeof caseSchema>;

