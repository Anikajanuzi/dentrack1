"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp, Compass, ListChecks, RotateCcw } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { useTour } from "./tour-provider";

/** The permanent "?" in the top bar: restart or continue the tour, bring back the checklist. */
export function HelpMenu({ showChecklistOption }: { showChecklistOption: boolean }) {
  const tour = useTour();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  if (!tour) return null;
  const canContinue = tour.status === "in_progress" && !tour.active;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("Help")} data-tour-help>
          <CircleHelp className="!size-[18px]" />
        </Button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel>{t("Help")}</MenuLabel>
        {canContinue && (
          <MenuItem onSelect={tour.resume}>
            <Compass /> {t("Continue guided tour (step {0} of {1})", { 0: tour.stepIndex + 1, 1: tour.steps.length })}
          </MenuItem>
        )}
        <MenuItem onSelect={tour.start}>
          <RotateCcw /> {tour.status === "not_started" ? t("Start the guided tour") : t("Restart the guided tour")}
        </MenuItem>
        {showChecklistOption && tour.checklistDismissed && (
          <MenuItem onSelect={() => { tour.setChecklistDismissed(false); if (pathname !== "/dashboard") router.push("/dashboard"); }}>
            <ListChecks /> {t("Show the Getting started checklist")}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

/** Same options in Settings, for people who look there first. */
export function HelpCard({ showChecklistOption }: { showChecklistOption: boolean }) {
  const tour = useTour();
  const { t } = useI18n();
  const router = useRouter();
  if (!tour) return null;
  return (
    <div className="rounded-2xl border border-line/80 bg-surface p-5 shadow-soft">
      <h2 className="text-[15px] font-semibold">{t("Help and guided tour")}</h2>
      <p className="mt-1 text-[13px] text-muted">{t("A two-minute walk through the dashboard, trays, cases and finances. It doesn't change any data.")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tour.status === "in_progress" && <Button variant="secondary" onClick={tour.resume}><Compass /> {t("Continue the tour")}</Button>}
        <Button variant="secondary" onClick={tour.start}><RotateCcw /> {tour.status === "not_started" ? t("Start the guided tour") : t("Restart the guided tour")}</Button>
        {showChecklistOption && tour.checklistDismissed && (
          <Button variant="secondary" onClick={() => { tour.setChecklistDismissed(false); router.push("/dashboard"); }}><ListChecks /> {t("Show the Getting started checklist")}</Button>
        )}
      </div>
    </div>
  );
}
