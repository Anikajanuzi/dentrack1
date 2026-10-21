"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/lib/toast";
import { Info } from "lucide-react";
import { caseSchema, type CaseInput } from "@/lib/validation/case";
import { createCaseAction } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { D, money as toMoney } from "@/lib/finance";
import { trayCode } from "@/lib/utils";
import type { getNewCaseOptions } from "@/lib/data/cases";

type Options = Awaited<ReturnType<typeof getNewCaseOptions>>;

function Section({ title, description, children, tour }: { title: string; description?: string; children: React.ReactNode; tour?: string }) {
  const { t } = useI18n();
  return (
    <Card data-tour={tour} className="grid gap-6 p-5 md:grid-cols-[220px_1fr] md:p-6">
      <div>
        <h2 className="font-display text-[16px] font-semibold text-ink">{t(title)}</h2>
        {description && <p className="mt-1 text-[13px] text-muted">{t(description)}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export function CaseForm({ o, presetTray }: { o: Options; presetTray?: string }) {
  const { fmt, t } = useI18n();
  const addDays = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<CaseInput>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      priority: "normal",
      units: 1,
      received_date: o.today,
      due_date: addDays(o.today, 7),
      tray_id: presetTray && o.trays.some((item) => item.id === presetTray) ? presetTray : "",
      technician_id: !o.isAdmin && o.myTechnicianId ? o.myTechnicianId : "",
    },
  });
  const clinicId = watch("clinic_id");
  const categoryId = watch("category_id");
  const serviceId = watch("service_id");
  const units = Number(watch("units") || 1);
  const patientRef = watch("patient_reference");

  const dentists = o.dentists.filter((d) => d.clinic_id === clinicId);
  const services = o.services.filter((s) => s.category_id === categoryId);
  const service = o.services.find((s) => s.id === serviceId);
  const listPrice = service?.price ? toMoney(D(service.price).times(units)) : null;
  const existingPatient = o.patients.find((p) => p.reference.toLowerCase() === (patientRef ?? "").trim().toLowerCase());

  React.useEffect(() => {
    if (serviceId && !services.some((s) => s.id === serviceId)) setValue("service_id", "");
  }, [categoryId, serviceId, services, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    const r = await createCaseAction(v);
    if (r && !r.ok) {
      toast.error(r.error);
      Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof CaseInput, { message: m }));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Section tour="case-form" title={t("Patient and clinic")} description="A patient reference is enough. Add a name only if the lab needs it.">
        <Field label="Dental clinic" htmlFor="clinic_id" error={errors.clinic_id?.message} required>
          <Select id="clinic_id" aria-invalid={!!errors.clinic_id} {...register("clinic_id")}>
            <option value="">{t("Choose a clinic")}</option>
            {o.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Dentist" htmlFor="dentist_id" hint={clinicId && dentists.length === 0 ? t("No dentists recorded for this clinic.") : undefined}>
          <Select id="dentist_id" disabled={!clinicId} {...register("dentist_id")}>
            <option value="">{t("Not specified")}</option>
            {dentists.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </Select>
        </Field>
        <Field
          label="Patient reference"
          htmlFor="patient_reference"
          error={errors.patient_reference?.message}
          required
          hint={patientRef?.trim() ? (existingPatient ? t("Existing patient — this case will be added to their history.") : t("New patient record will be created.")) : t("e.g. the clinic's patient code")}
        >
          <Input id="patient_reference" list="patient-refs" autoComplete="off" aria-invalid={!!errors.patient_reference} {...register("patient_reference")} />
          <datalist id="patient-refs">
            {o.patients.filter((p) => !clinicId || p.clinic_id === clinicId).map((p) => <option key={p.id} value={p.reference}>{p.full_name ?? ""}</option>)}
          </datalist>
        </Field>
        <Field label="Patient name" htmlFor="patient_name" hint="Optional.">
          <Input id="patient_name" disabled={!!existingPatient} placeholder={existingPatient?.full_name ?? ""} {...register("patient_name")} />
        </Field>
      </Section>

      <Section title={t("Work")} description="What the lab is making.">
        <Field label="Prosthetic category" htmlFor="category_id" error={errors.category_id?.message} required>
          <Select id="category_id" aria-invalid={!!errors.category_id} {...register("category_id")}>
            <option value="">{t("Choose a category")}</option>
            {o.categories.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
          </Select>
        </Field>
        <Field label="Service" htmlFor="service_id" hint={categoryId && services.length === 0 ? t("No services configured in this category.") : undefined}>
          <Select id="service_id" disabled={!categoryId} {...register("service_id")}>
            <option value="">{t("Not specified")}</option>
            {services.map((s) => <option key={s.id} value={s.id}>{t(s.name)}</option>)}
          </Select>
        </Field>
        <Field label="Units" htmlFor="units" error={errors.units?.message} hint="Crowns, bridge units or appliances.">
          <Input id="units" type="number" min={1} max={64} {...register("units")} />
        </Field>
        <Field label="Shade" htmlFor="shade">
          <Input id="shade" placeholder="e.g. A2" {...register("shade")} />
        </Field>
        <Field label="Tooth numbers" htmlFor="tooth_numbers" className="sm:col-span-2" hint="FDI notation, e.g. 14, 15, 16">
          <Input id="tooth_numbers" {...register("tooth_numbers")} />
        </Field>
      </Section>

      <Section title={t("Production")} description="Dates follow the laboratory's timezone.">
        <Field label="Case reference" htmlFor="reference" hint="Leave empty to number it automatically (C-YYYY-NNNN)." error={errors.reference?.message}>
          <Input id="reference" placeholder={t("Automatic")} {...register("reference")} />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" {...register("priority")}>
            <option value="low">{t("Low")}</option>
            <option value="normal">{t("Normal")}</option>
            <option value="high">{t("High")}</option>
            <option value="urgent">{t("Urgent")}</option>
          </Select>
        </Field>
        <Field label="Date received" htmlFor="received_date" error={errors.received_date?.message} required>
          <Input id="received_date" type="date" {...register("received_date")} />
        </Field>
        <Field label="Due date" htmlFor="due_date" error={errors.due_date?.message} required>
          <Input id="due_date" type="date" aria-invalid={!!errors.due_date} {...register("due_date")} />
        </Field>
        <Field label="Technician" htmlFor="technician_id">
          <Select id="technician_id" {...register("technician_id")}>
            <option value="">{t("Assign later")}</option>
            {o.technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Tray" htmlFor="tray_id" hint={o.trays.length === 0 ? t("No trays are available right now.") : t("Place the work in this numbered tray.")}>
          <Select id="tray_id" {...register("tray_id")}>
            <option value="">{t("Not in a tray yet")}</option>
            {o.trays.map((item) => <option key={item.id} value={item.id}>{trayCode(item.number)}{item.label ? ` — ${item.label}` : ""}</option>)}
          </Select>
        </Field>
      </Section>

      {o.isAdmin && (
        <Section title={t("Pricing")} description="Visible to administrators only. The price is saved with the case and never changes when the price list does.">
          <Field
            label={t("Selling price ({0})", { 0: o.currency })}
            htmlFor="selling_price"
            error={errors.selling_price?.message}
            hint={listPrice ? t("Leave empty to use the price list: {0}{1}.", { 0: fmt.money(listPrice, o.currency), 1: units > 1 ? ` (${units} units)` : "" }) : service ? t("This service has no list price yet.") : t("Enter a price, or choose a priced service.")}
          >
            <Input id="selling_price" inputMode="decimal" placeholder={listPrice ?? "0.00"} {...register("selling_price")} />
          </Field>
          <Field label={t("Discount ({0})", { 0: o.currency })} htmlFor="discount_amount" error={errors.discount_amount?.message}>
            <Input id="discount_amount" inputMode="decimal" placeholder="0.00" {...register("discount_amount")} />
          </Field>
          <Field
            label={t("Estimated direct cost ({0})", { 0: o.currency })}
            htmlFor="estimated_direct_cost"
            className="sm:col-span-2"
            error={errors.estimated_direct_cost?.message}
            hint="Optional planning figure. It is shown as an estimate and never counted as a recorded cost."
          >
            <Input id="estimated_direct_cost" inputMode="decimal" className="sm:max-w-[calc(50%-0.5rem)]" {...register("estimated_direct_cost")} />
          </Field>
        </Section>
      )}

      <Section title={t("Notes")} description="Instructions from the dentist or anything the bench should know.">
        <Field label="Case notes" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" rows={4} {...register("notes")} />
        </Field>
      </Section>

      {!o.isAdmin && (
        <p className="flex items-center gap-2 text-[13px] text-muted"><Info className="size-4" /> {t("An administrator sets the price for this case.")}</p>
      )}
      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-line bg-bg/90 px-1 py-3 backdrop-blur">
        <Link href="/cases" className="inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium text-ink-2 hover:bg-surface-2">{t("Cancel")}</Link>
        <Button type="submit" loading={isSubmitting}>{t("Create case")}</Button>
      </div>
    </form>
  );
}
