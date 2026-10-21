"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, ListChecks, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-provider";

export type SetupProgress = { trays: boolean; clinics: boolean; prices: boolean; cases: boolean };

const ITEMS: Array<{ key: keyof SetupProgress; title: string; why: string; href: string }> = [
  { key: "trays", title: "Add your numbered trays", why: "Each digital tray matches an engraved tray on your bench.", href: "/trays" },
  { key: "clinics", title: "Add your first clinic", why: "The dental practices that send you work.", href: "/clinics" },
  { key: "prices", title: "Set prices for your services", why: "Prices then fill in automatically when you create a case.", href: "/settings?tab=services" },
  { key: "cases", title: "Create your first case", why: "Register incoming work and place it in a tray.", href: "/cases/new" },
];

/**
 * First steps for a new laboratory. Ticks itself off from real data, disappears when everything
 * is done, and can be hidden (then brought back from Help or Settings).
 */
export function GettingStarted({ setup }: { setup: SetupProgress }) {
  const tour = useTour();
  const { t } = useI18n();
  const done = ITEMS.filter((i) => setup[i.key]).length;
  if (!tour || tour.checklistDismissed || done === ITEMS.length) return null;
  return (
    <section aria-labelledby="getting-started" className="rounded-2xl border border-line/80 bg-surface p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-occupied-soft text-occupied"><ListChecks className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="getting-started" className="font-display text-[16px] font-semibold">{t("Getting started")}</h2>
          <p className="text-[13px] text-muted">{t("{0} of {1} done. Each step takes a minute or two.", { 0: done, 1: ITEMS.length })}</p>
        </div>
        <button
          onClick={() => tour.setChecklistDismissed(true)}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label={t("Hide the checklist (bring it back from Help)")}
          title={t("Hide the checklist (bring it back from Help)")}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / ITEMS.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map((item) => {
          const ok = setup[item.key];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  "group flex h-full gap-3 rounded-xl border p-3 transition-colors",
                  ok ? "border-line bg-surface-2/50" : "border-line hover:border-primary/50 hover:bg-surface-2/60",
                )}
              >
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", ok ? "border-primary bg-primary text-primary-fg" : "border-line-strong")}>
                  {ok && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13.5px] font-medium", ok ? "text-muted line-through" : "text-ink")}>
                    {t(item.title)}<span className="sr-only">{ok ? `, ${t("done")}` : ""}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">{t(item.why)}</span>
                </span>
                {!ok && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
