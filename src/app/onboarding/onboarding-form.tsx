"use client";

import * as React from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { toast } from "@/lib/toast";
import { createDemoAction, createLaboratoryAction } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { useI18n } from "@/components/i18n-provider";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "CZK", "RON", "SEK", "NOK", "DKK", "ALL", "RSD", "BAM", "MKD", "TRY", "CAD", "AUD"];

export function OnboardingForm({ hasDemo, canCancel }: { hasDemo: boolean; canCancel: boolean }) {
  const { t } = useI18n();
  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState("UTC");
  const [currency, setCurrency] = React.useState("EUR");
  const [trays, setTrays] = React.useState("24");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<"lab" | "demo" | null>(null);
  const zones = React.useMemo(() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC"]; }
  }, []);
  React.useEffect(() => {
    try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("lab");
    const r = await createLaboratoryAction({ name, timezone, currency, trayCount: Number(trays) });
    setBusy(null);
    if (r && !r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
  }
  async function demo() {
    setBusy("demo");
    const r = await createDemoAction();
    setBusy(null);
    if (r && !r.ok) toast.error(r.error);
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Laboratory name" htmlFor="lab-name" error={errors.name} className="sm:col-span-2" required>
            <Input id="lab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Northgate Dental Lab")} autoFocus />
          </Field>
          <Field label="Timezone" htmlFor="tz" hint="Due dates and overdue status follow this timezone.">
            <Select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="cur">
            <Select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Number of trays" htmlFor="trays" error={errors.trayCount} hint="Creates trays #001 onwards. Add more anytime." className="sm:col-span-2">
            <Input id="trays" type="number" min={0} max={500} value={trays} onChange={(e) => setTrays(e.target.value)} className="max-w-32" />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={busy === "lab"} disabled={busy !== null}>{t("Create laboratory")}</Button>
            {canCancel && <Link href="/dashboard" className="inline-flex h-9 items-center px-3 text-sm text-muted hover:text-ink">{t("Cancel")}</Link>}
          </div>
        </form>
      </Card>
      {!hasDemo && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn"><FlaskConical className="size-5" /></div>
          <div className="flex-1">
            <p className="font-display text-[15px] font-semibold">{t("Explore with demo data first")}</p>
            <p className="text-[13px] text-muted">{t("A separate workspace with fictional clinics, cases, costs and payments. Your real laboratory stays empty and untouched.")}</p>
          </div>
          <Button variant="secondary" onClick={demo} loading={busy === "demo"} disabled={busy !== null}>{t("Open demo")}</Button>
        </Card>
      )}
    </div>
  );
}
