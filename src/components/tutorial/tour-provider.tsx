"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { saveTutorialAction, setChecklistDismissedAction } from "@/lib/actions/tutorial";
import type { TutorialState, TutorialStatus } from "@/lib/tutorial/types";
import { stepsFor, type TourStep } from "./tour-steps";
import { TourOverlay } from "./tour-overlay";
import { TourWelcome, TourResume } from "./tour-prompts";

/**
 * Guided tour state for the signed-in user in the active laboratory.
 *
 * Progress is saved to the database (migration 0008) and mirrored in localStorage, which is the
 * only store until that migration is applied. Saving never navigates or refreshes the page; the
 * tour moves between pages itself, once per step, so it can't cause a redirect loop.
 */
interface TourApi {
  status: TutorialStatus;
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  checklistDismissed: boolean;
  start: () => void;
  resume: () => void;
  pause: () => void;
  skip: () => void;
  next: () => void;
  back: () => void;
  finish: (href: string) => void;
  setChecklistDismissed: (dismissed: boolean) => void;
}

const Ctx = React.createContext<TourApi | null>(null);
export const useTour = () => React.useContext(Ctx);

type Local = Partial<Pick<TutorialState, "status" | "step" | "checklistDismissed">>;
const readLocal = (key: string): Local => {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}") as Local; } catch { return {}; }
};
const writeLocal = (key: string, v: Local) => {
  try { localStorage.setItem(key, JSON.stringify({ ...readLocal(key), ...v })); } catch {}
};

export function TourProvider({
  userId, labId, isAdmin, initial, children,
}: { userId: string; labId: string; isAdmin: boolean; initial: TutorialState; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = React.useMemo(() => stepsFor(isAdmin), [isAdmin]);
  const localKey = `dt-tour:${userId}:${labId}`;
  const doneKey = `dt-tour-completed:${userId}`;
  const sessionKey = `dt-tour-active:${userId}:${labId}`;

  const [status, setStatus] = React.useState<TutorialStatus>(initial.status);
  const [stepIndex, setStepIndex] = React.useState(Math.min(initial.step, steps.length - 1));
  const [checklistDismissed, setDismissed] = React.useState(initial.checklistDismissed);
  const [completedElsewhere, setCompletedElsewhere] = React.useState(initial.completedElsewhere);
  const [active, setActive] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // After mount: fill in from this browser when the database can't store progress yet, and
  // resume a tour that was open when the page was refreshed (sessionStorage = same tab only).
  React.useEffect(() => {
    let st = initial.status;
    let step = initial.step;
    if (!initial.stored) {
      const l = readLocal(localKey);
      if (l.status) st = l.status;
      if (typeof l.step === "number") step = l.step;
      if (typeof l.checklistDismissed === "boolean") setDismissed(l.checklistDismissed);
      try { if (localStorage.getItem(doneKey) === "1") setCompletedElsewhere(true); } catch {}
      setStatus(st);
      setStepIndex(Math.min(Math.max(step, 0), steps.length - 1));
    }
    try {
      if (st === "in_progress" && sessionStorage.getItem(sessionKey) === "1") setActive(true);
    } catch {}
    setMounted(true);
    // Runs once per laboratory: the provider remounts when the active laboratory changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = React.useCallback((s: TutorialStatus, step: number) => {
    setStatus(s);
    writeLocal(localKey, { status: s, step });
    if (s === "completed") { try { localStorage.setItem(doneKey, "1"); } catch {} }
    void saveTutorialAction({ status: s, step }).catch(() => {});
  }, [localKey, doneKey]);

  const setSession = React.useCallback((on: boolean) => {
    try { if (on) sessionStorage.setItem(sessionKey, "1"); else sessionStorage.removeItem(sessionKey); } catch {}
  }, [sessionKey]);

  const goTo = React.useCallback((i: number) => {
    const clamped = Math.min(Math.max(i, 0), steps.length - 1);
    setStepIndex(clamped);
    save("in_progress", clamped);
  }, [steps.length, save]);

  const api: TourApi = {
    status, active, stepIndex, steps, checklistDismissed,
    start: () => { setActive(true); setSession(true); goTo(0); },
    resume: () => { setActive(true); setSession(true); goTo(stepIndex); },
    pause: () => { setActive(false); setSession(false); },
    skip: () => { setActive(false); setSession(false); save("skipped", stepIndex); },
    next: () => goTo(stepIndex + 1),
    back: () => goTo(stepIndex - 1),
    finish: (href) => {
      setActive(false); setSession(false); save("completed", steps.length - 1); setCompletedElsewhere(true);
      if (href !== pathname) router.push(href);
    },
    setChecklistDismissed: (d) => {
      setDismissed(d);
      writeLocal(localKey, { checklistDismissed: d });
      void setChecklistDismissedAction(d).catch(() => {});
    },
  };

  const invite = mounted && !active && status === "not_started" && !completedElsewhere && pathname === "/dashboard";
  const offerResume = mounted && !active && status === "in_progress";

  return (
    <Ctx.Provider value={api}>
      {children}
      {active && <TourOverlay key={stepIndex} />}
      <TourWelcome open={invite} onStart={api.start} onSkip={api.skip} />
      {offerResume && <TourResume />}
    </Ctx.Provider>
  );
}
