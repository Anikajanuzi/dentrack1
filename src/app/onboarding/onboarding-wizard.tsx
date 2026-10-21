"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, CalendarClock, Check, ClipboardList, FlaskConical, Grid3x3, Receipt, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { createDemoAction, createLaboratoryAction, type CreatedLab } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { TrayVisual } from "@/components/trays/tray-visual";
import { useI18n } from "@/components/i18n-provider";
import { cn, trayCode } from "@/lib/utils";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "CZK", "RON", "SEK", "NOK", "DKK", "ALL", "RSD", "BAM", "MKD", "TRY", "CAD", "AUD"];

// A sensible default currency from the browser's time zone. Users can always change it.
const ZONE_CURRENCY: Record<string, string> = {
  "Europe/Tirane": "ALL", "Europe/Budapest": "HUF", "Europe/Warsaw": "PLN", "Europe/Prague": "CZK",
  "Europe/Bucharest": "RON", "Europe/Stockholm": "SEK", "Europe/Oslo": "NOK", "Europe/Copenhagen": "DKK",
  "Europe/Belgrade": "RSD", "Europe/Sarajevo": "BAM", "Europe/Skopje": "MKD", "Europe/Istanbul": "TRY",
  "Europe/London": "GBP", "Europe/Zurich": "CHF", "Australia/Sydney": "AUD", "Australia/Melbourne": "AUD",
  "America/Toronto": "CAD", "America/Vancouver": "CAD",
};
const guessCurrency = (tz: string) => ZONE_CURRENCY[tz] ?? (tz.startsWith("America/") ? "USD" : "EUR");
const cityOf = (tz: string) => tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

type Step = "welcome" | "lab" | "trays" | "done";
const STEPS: Step[] = ["welcome", "lab", "trays", "done"];
const STEP_LABELS: Record<Step, string> = { welcome: "Welcome", lab: "Laboratory", trays: "Trays", done: "Ready" };

export function OnboardingWizard({ hasDemo, canCancel }: { hasDemo: boolean; canCancel: boolean }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [step, setStep] = React.useState<Step>("welcome");
  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState("UTC");
  const [currency, setCurrency] = React.useState("EUR");
  const [editZone, setEditZone] = React.useState(false);
  const [trayCount, setTrayCount] = React.useState("24");
  const [trayStart, setTrayStart] = React.useState("1");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<"lab" | "demo" | null>(null);
  const [created, setCreated] = React.useState<CreatedLab | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const zones = React.useMemo(() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC"]; }
  }, []);
  React.useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setTimezone(tz);
      setCurrency(guessCurrency(tz));
    } catch {}
  }, []);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  // ── tray validation (mirrors the server) ──
  const count = Number(trayCount);
  const start = Number(trayStart);
  const trayError =
    !/^\d+$/.test(trayCount) || count < 1 ? "Enter how many trays you have (1 or more), or skip this step."
    : count > 500 ? "You can add up to 500 trays at once. Add the rest later from the tray board."
    : null;
  const startError =
    !/^\d+$/.test(trayStart) || start < 1 ? "Tray numbers start at 1 or higher."
    : start > 9999 ? "Tray numbers go up to 9999."
    : !trayError && start + count - 1 > 9999 ? "The last tray would be above #9999. Lower the first number or the count."
    : null;

  function nextFromLab() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter the laboratory name";
    setErrors(e);
    if (Object.keys(e).length === 0) setStep("trays");
  }

  async function create(withTrays: boolean) {
    if (withTrays && (trayError || startError)) return;
    setBusy("lab");
    const r = await createLaboratoryAction({
      name, timezone, currency,
      trayCount: withTrays ? count : 0,
      trayStart: withTrays ? start : 1,
    });
    setBusy(null);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      if (r.fieldErrors?.name) setStep("lab");
      toast.error(r.error);
      return;
    }
    setCreated(r.data ?? null);
    setStep("done");
  }

  async function demo() {
    setBusy("demo");
    const r = await createDemoAction();
    setBusy(null);
    if (r && !r.ok) toast.error(r.error);
  }

  const idx = STEPS.indexOf(step);
  const anim = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  return (
    <div className="w-full">
      {/* Progress */}
      <ol className="mb-6 flex items-center gap-2" aria-label={t("Setup progress")}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={s === step ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                i < idx ? "bg-primary text-primary-fg" : i === idx ? "bg-navy text-white ring-2 ring-primary/40 dark:bg-primary dark:text-primary-fg" : "bg-surface-2 text-muted",
              )}
            >
              {i < idx ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-[12px] font-medium sm:inline", i === idx ? "text-ink" : "text-muted")}>{t(STEP_LABELS[s])}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < idx ? "bg-primary" : "bg-line")} aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{t("Step {0} of {1}: {2}", { 0: idx + 1, 1: STEPS.length, 2: t(STEP_LABELS[step]) })}</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} {...anim} transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}>
          {step === "welcome" && (
            <div className="space-y-5">
              <section className="dot-grid relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1727] via-navy to-deep p-6 text-white shadow-float sm:p-8">
                <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-teal/25 blur-3xl" aria-hidden />
                <div className="relative">
                  <h1 ref={headingRef} tabIndex={-1} className="font-display text-[1.9rem] font-bold leading-tight tracking-[-0.02em] outline-none sm:text-[2.2rem]">
                    {t("Welcome to DENTRACK")}
                  </h1>
                  <p className="mt-2 max-w-xl text-[15px] text-slate-300">
                    {t("DENTRACK keeps track of every case in your dental laboratory: which numbered tray it's in, who is working on it, when it's due and what it cost to make.")}
                  </p>
                  <p className="mt-3 max-w-xl text-[14px] text-slate-300">
                    {t("Everything lives in a laboratory workspace: your trays, clinics, patients, cases, team and finances, visible only to you and the people you invite.")}
                  </p>
                  <ul className="mt-5 grid gap-2 text-[13px] text-slate-200 sm:grid-cols-2">
                    {[
                      [Grid3x3, "Numbered trays matched to your bench"],
                      [ClipboardList, "Cases from intake to delivery"],
                      [CalendarClock, "Deadlines and overdue warnings"],
                      [Receipt, "Costs, invoices, payments and profit"],
                    ].map(([Icon, label]) => {
                      const I = Icon as typeof Grid3x3;
                      return (
                        <li key={label as string} className="flex items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-md bg-white/10 text-ice"><I className="size-3.5" /></span>
                          {t(label as string)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                <ChoiceCard
                  icon={<Building2 />}
                  tone="primary"
                  title="Create my laboratory"
                  body="Set up your real workspace for your own records. It starts empty, and only you and the people you invite can see it."
                  action={<Button className="w-full" onClick={() => setStep("lab")} disabled={busy !== null}>{t("Create my laboratory")} <ArrowRight /></Button>}
                />
                <ChoiceCard
                  icon={<FlaskConical />}
                  tone="warn"
                  title="Explore demo"
                  body="Try DENTRACK with fictional clinics, cases and payments in a separate practice workspace. Your real laboratory data is never touched."
                  action={<Button variant="secondary" className="w-full" onClick={demo} loading={busy === "demo"} disabled={busy !== null}>{hasDemo ? t("Open the demo") : t("Explore demo")}</Button>}
                />
              </div>
              {canCancel && (
                <p className="text-center text-[13px]"><Link href="/dashboard" className="text-muted hover:text-ink">{t("Cancel and go back")}</Link></p>
              )}
            </div>
          )}

          {step === "lab" && (
            <Card className="p-6 sm:p-7">
              <h1 ref={headingRef} tabIndex={-1} className="type-title outline-none">{t("Your laboratory")}</h1>
              <p className="mb-5 mt-1 text-[14px] text-muted">{t("Just the basics. You can change all of this later in Settings.")}</p>
              <form onSubmit={(e) => { e.preventDefault(); nextFromLab(); }} className="grid gap-5" noValidate>
                <Field label="Laboratory name" htmlFor="lab-name" error={errors.name} hint="Shown at the top of every page and on your invoices." required>
                  <Input id="lab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Northgate Dental Lab")} autoFocus autoComplete="organization" maxLength={120} />
                </Field>
                <Field label="Currency" htmlFor="cur" hint="Used for prices, costs, invoices and payments.">
                  <Select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className="max-w-48">
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <div className="space-y-1.5">
                  <p className="text-[13px] font-medium text-ink">{t("Time zone")}</p>
                  {!editZone ? (
                    <p className="text-[13px] text-muted">
                      {t("Due dates and overdue warnings use {0} time.", { 0: cityOf(timezone) })}{" "}
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => setEditZone(true)}>{t("Change")}</button>
                    </p>
                  ) : (
                    <Select id="tz" aria-label={t("Time zone")} value={timezone} onChange={(e) => setTimezone(e.target.value)} className="max-w-80">
                      {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                    </Select>
                  )}
                </div>
                <WizardNav onBack={() => setStep("welcome")} next={<Button type="submit">{t("Continue")} <ArrowRight /></Button>} />
              </form>
            </Card>
          )}

          {step === "trays" && (
            <Card className="p-6 sm:p-7">
              <h1 ref={headingRef} tabIndex={-1} className="type-title outline-none">{t("Your numbered trays")}</h1>
              <div className="mb-5 mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="w-40 shrink-0 self-center sm:self-auto">
                  <TrayVisual number={!startError ? start : 1} state="available" idSuffix="-wizard" />
                </div>
                <p className="text-[14px] text-muted">
                  {t("Every physical tray on your bench has a number engraved on it. DENTRACK creates a digital tray with the same number, so tray #{0} on the bench is tray #{0} on screen. When you put a case in a tray, you record it here.", { 0: trayCode(!startError ? start : 1).replace("#", "") })}
                </p>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); create(true); }} className="grid gap-5" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="How many numbered trays do you have?" htmlFor="tray-count" error={trayCount && trayError ? trayError : errors.trayCount}>
                    <Input id="tray-count" inputMode="numeric" value={trayCount} onChange={(e) => setTrayCount(e.target.value.replace(/\D/g, "").slice(0, 4))} className="max-w-32" aria-describedby="tray-preview" />
                  </Field>
                  <Field label="What number is the first tray?" htmlFor="tray-start" error={trayStart && startError ? startError : errors.trayStart} hint="Not every laboratory starts at 1.">
                    <Input id="tray-start" inputMode="numeric" value={trayStart} onChange={(e) => setTrayStart(e.target.value.replace(/\D/g, "").slice(0, 4))} className="max-w-32" aria-describedby="tray-preview" />
                  </Field>
                </div>
                <TrayPreview count={trayError || startError ? 0 : count} start={start} />
                <WizardNav
                  onBack={() => setStep("lab")}
                  extra={<Button type="button" variant="ghost" onClick={() => create(false)} disabled={busy !== null}>{t("Skip, I'll add trays later")}</Button>}
                  next={<Button type="submit" loading={busy === "lab"} disabled={busy !== null || Boolean(trayError || startError)}>{t("Create laboratory")}</Button>}
                />
              </form>
            </Card>
          )}

          {step === "done" && (
            <Card className="p-6 text-center sm:p-8">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal to-[#0b7f78] text-white shadow-soft">
                <Sparkles className="size-6" />
              </div>
              <h1 ref={headingRef} tabIndex={-1} className="type-title outline-none">{t("Your laboratory is ready")}</h1>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">
                {created?.trays
                  ? t("{0} is set up with {1} trays, numbered {2} to {3}.", { 0: created.name, 1: created.trays.count, 2: trayCode(created.trays.from), 3: trayCode(created.trays.to) })
                  : t("{0} is set up. You can add your numbered trays from the tray board whenever you're ready.", { 0: created?.name ?? "" })}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">
                {t("Next you can add your first clinic, create cases and place them in trays. A short guided tour is available on the dashboard if you'd like one.")}
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[15px] font-medium text-primary-fg shadow-soft transition-colors hover:bg-primary-hover"
              >
                {t("Go to my dashboard")} <ArrowRight className="size-4" />
              </Link>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ChoiceCard({ icon, title, body, action, tone }: { icon: React.ReactNode; title: string; body: string; action: React.ReactNode; tone: "primary" | "warn" }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className={cn("flex size-10 items-center justify-center rounded-xl [&_svg]:size-5", tone === "primary" ? "bg-occupied-soft text-occupied" : "bg-warn-soft text-warn")}>{icon}</span>
      <div className="flex-1">
        <h2 className="font-display text-[16px] font-semibold">{t(title)}</h2>
        <p className="mt-1 text-[13px] text-muted">{t(body)}</p>
      </div>
      {action}
    </Card>
  );
}

function WizardNav({ onBack, next, extra }: { onBack?: () => void; next: React.ReactNode; extra?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
      {onBack && <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft /> {t("Back")}</Button>}
      <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:items-center">{extra}{next}</div>
    </div>
  );
}

/** Live preview of the digital trays that will be created. */
function TrayPreview({ count, start }: { count: number; start: number }) {
  const { t } = useI18n();
  if (count < 1) return <div id="tray-preview" className="rounded-xl border border-dashed border-line p-4 text-center text-[13px] text-muted">{t("The tray preview appears here.")}</div>;
  const nums = Array.from({ length: Math.min(count, 500) }, (_, i) => start + i);
  const shown = nums.length > 12 ? [...nums.slice(0, 10), null, nums[nums.length - 1]] : nums;
  return (
    <div id="tray-preview" className="rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="mb-3 text-[13px] text-ink-2">
        {t("{0} digital trays will be created: {1} to {2}.", { 0: count, 1: trayCode(nums[0]), 2: trayCode(nums[nums.length - 1]) })}
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-hidden>
        {shown.map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="flex h-10 items-center justify-center text-muted">…</span>
          ) : (
            <span key={n} className="flex h-10 items-center justify-center rounded-lg border border-primary/30 bg-surface text-[13px] font-semibold tabular text-primary">
              {trayCode(n)}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
