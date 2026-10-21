"use client";

import * as React from "react";
import { Compass, Play, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { useTour } from "./tour-provider";
import { LanguageSwitch } from "@/components/shell/switches";

/** Asked once per laboratory (not if the tour was completed in another laboratory). */
export function TourWelcome({ open, onStart, onSkip }: { open: boolean; onStart: () => void; onSkip: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onSkip(); }}
      title="Welcome to DENTRACK!"
      description="Would you like a quick guided tour to learn how everything works?"
      size="sm"
      closeOnOutsideClick={false}
      footer={
        <>
          <Button variant="ghost" onClick={onSkip}>{t("Skip for now")}</Button>
          <Button onClick={onStart}><Play /> {t("Start tutorial")}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-occupied-soft text-occupied"><Compass className="size-5" /></span>
        <p className="text-[13.5px] text-ink-2">
          {t("It takes about two minutes, shows the real screens and doesn't change any of your data. You can skip it and start it any time from Help, the ? button at the top.")}
        </p>
      </div>
      {/* The page's own switches are behind this dialog, so it carries its own. */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-[12.5px] text-muted">{t("Language")}</span>
        <LanguageSwitch />
      </div>
    </Dialog>
  );
}

/** Shown when a tour was left halfway (closed, or another page opened in a new tab). */
export function TourResume() {
  const tour = useTour()!;
  const { t } = useI18n();
  return (
    <div
      className="fixed z-40 flex items-center gap-1 rounded-full border border-line bg-surface p-1 pl-3 shadow-float"
      style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
      role="region"
      aria-label={t("Guided tour")}
    >
      <Compass className="size-4 text-primary" aria-hidden />
      <button onClick={tour.resume} className="rounded-full px-2 py-1.5 text-[13px] font-medium text-ink hover:text-primary">
        {t("Continue tour · step {0} of {1}", { 0: tour.stepIndex + 1, 1: tour.steps.length })}
      </button>
      <button onClick={tour.skip} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t("End the tour")}>
        <X className="size-4" />
      </button>
    </div>
  );
}
