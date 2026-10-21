"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-provider";
import { LanguageSwitch } from "@/components/shell/switches";

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const HEADER = 72; // sticky app header height + breathing room
const FIND_TIMEOUT = 2500; // ms to wait for a step's element before showing the step centered
const MOBILE = 640;

/** One tour step: navigates to its page (once), spotlights its element and explains it. */
export function TourOverlay() {
  const tour = useTour()!;
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const step = tour.steps[tour.stepIndex];
  const isLast = tour.stepIndex === tour.steps.length - 1;
  const titleId = React.useId();
  const bodyId = React.useId();

  const [el, setEl] = React.useState<Element | null>(null);
  const [searching, setSearching] = React.useState(Boolean(step.targets?.length));
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [vp, setVp] = React.useState({ w: 1024, h: 768 });
  const [boxH, setBoxH] = React.useState(280);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const mobile = vp.w < MOBILE;

  // 1 · Go to the step's page. Exactly once per step (this component remounts per step), and only
  //     if we aren't there already: the tour can never bounce between pages.
  const pushed = React.useRef(false);
  React.useEffect(() => {
    if (step.route && pathname !== step.route && !pushed.current) {
      pushed.current = true;
      router.push(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2 · Find the element once we're on the right page. Give up after FIND_TIMEOUT and show the
  //     step centered instead (missing permission, no data, page unavailable).
  React.useEffect(() => {
    if (!step.targets?.length) return;
    const started = performance.now();
    let raf = 0;
    const look = () => {
      const onPage = !step.route || pathname === step.route;
      if (onPage) {
        for (const sel of step.targets!) {
          const found = document.querySelector(sel);
          if (found && found.getBoundingClientRect().width > 0) {
            setEl(found);
            setSearching(false);
            return;
          }
        }
      }
      if (performance.now() - started > FIND_TIMEOUT + (onPage ? 0 : 1500)) { setSearching(false); return; }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [pathname, step]);

  // 3 · Scroll it into view below the sticky header, then follow it while the page moves.
  React.useEffect(() => {
    if (!el) return;
    const node = el as HTMLElement;
    // The app scrolls the window; bring the element's top just below the sticky header.
    const r = node.getBoundingClientRect();
    // Scroll when it's above the header, low on the screen, or too tall to sit beside the explanation.
    const tooTall = r.top > HEADER + 8 && r.height > innerHeight * 0.5;
    if (r.top < HEADER || r.top > innerHeight * 0.45 || tooTall) scrollBy({ top: r.top - HEADER, behavior: reduced ? "auto" : "smooth" });
    let raf = 0;
    let last = "";
    const track = () => {
      const r = node.getBoundingClientRect();
      const key = `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)},${innerWidth},${innerHeight}`;
      if (key !== last) {
        last = key;
        setVp({ w: innerWidth, h: innerHeight });
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [el, reduced]);

  React.useEffect(() => {
    const onResize = () => setVp({ w: innerWidth, h: innerHeight });
    onResize();
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  // Measure the explanation box (its height decides where it fits) whenever its size changes.
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setBoxH(box.offsetHeight);
    const ro = new ResizeObserver(() => setBoxH(box.offsetHeight));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Focus the explanation for keyboard and screen-reader users at every step.
  React.useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [searching]);

  // Keyboard: ← → move, Esc pauses. Arrow keys typed into a form field stay with the field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable;
      if (e.key === "Escape") { e.preventDefault(); tour.pause(); return; }
      if (typing) return;
      if (e.key === "ArrowRight" && !isLast) { e.preventDefault(); tour.next(); }
      if (e.key === "ArrowLeft" && tour.stepIndex > 0) { e.preventDefault(); tour.back(); }
      if (e.key === "Tab" && boxRef.current) {
        // Keep focus inside the explanation unless the highlighted area is meant to be used.
        const inside = boxRef.current.contains(document.activeElement);
        const inTarget = step.interactive && el?.contains(document.activeElement);
        if (!inside && !inTarget) { e.preventDefault(); boxRef.current.querySelector<HTMLElement>("button")?.focus(); return; }
        if (inside && !step.interactive) {
          const f = [...boxRef.current.querySelectorAll<HTMLElement>("button, a[href]")];
          const i = f.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
        }
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [tour, isLast, step.interactive, el]);

  // ── geometry ────────────────────────────────────────────────
  // The spotlight is the element's visible part, capped so the explanation always fits beside it.
  let hole: Rect | null = null;
  if (rect && !searching) {
    const top = Math.max(rect.top - PAD, HEADER - PAD);
    // Tall elements (a long table) are spotlit from the top, leaving room for the explanation:
    // above a bottom panel on phones, below the spotlight on larger screens.
    const limit = mobile ? vp.h - boxH - 24 : top + Math.max(vp.h - HEADER - boxH - 40, 160);
    const bottom = Math.min(rect.top + rect.height + PAD, limit, vp.h - 8);
    const left = Math.max(rect.left - PAD, 8);
    const right = Math.min(rect.left + rect.width + PAD, vp.w - 8);
    if (bottom - top > 24 && right - left > 24) hole = { top, left, width: right - left, height: bottom - top };
  }

  const W = Math.min(380, vp.w - 32);
  let box: React.CSSProperties;
  if (mobile) {
    box = { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" };
  } else if (!hole) {
    box = { left: (vp.w - W) / 2, top: Math.max(24, (vp.h - boxH) / 2), width: W };
  } else {
    const gap = 14;
    const below = vp.h - (hole.top + hole.height);
    const above = hole.top - HEADER;
    const rightSpace = vp.w - (hole.left + hole.width);
    const clampX = (x: number) => Math.min(Math.max(x, 16), vp.w - W - 16);
    const clampY = (y: number) => Math.min(Math.max(y, 16), vp.h - boxH - 16);
    if (below >= boxH + gap + 8) box = { top: hole.top + hole.height + gap, left: clampX(hole.left), width: W };
    else if (above >= boxH + gap) box = { top: hole.top - boxH - gap, left: clampX(hole.left), width: W };
    else if (rightSpace >= W + gap + 8) box = { left: hole.left + hole.width + gap, top: clampY(hole.top), width: W };
    else if (hole.left >= W + gap + 8) box = { left: hole.left - W - gap, top: clampY(hole.top), width: W };
    else {
      // Last resort (page can't scroll far enough): explanation at the bottom, fully on screen,
      // and the spotlight shortened so the two never overlap.
      const boxTop = Math.max(16, vp.h - boxH - 16);
      box = { top: boxTop, left: clampX(hole.left), width: W };
      if (hole.top + hole.height > boxTop - gap) hole = { ...hole, height: Math.max(boxTop - gap - hole.top, 40) };
    }
  }

  const missing = !searching && Boolean(step.targets?.length) && !hole;
  const anim = reduced ? "" : "transition-[top,left,width,height,opacity] duration-300 ease-out";

  const content = (
    <div className="pointer-events-none fixed inset-0 z-[70]" data-tour-overlay>
      {/* Dimmed backdrop with a spotlight cut-out */}
      {hole ? (
        <div
          aria-hidden
          className={cn("pointer-events-none fixed rounded-xl ring-2 ring-teal ring-offset-0", anim)}
          style={{ ...hole, boxShadow: "0 0 0 9999px rgb(5 12 22 / 0.62)" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgb(5_12_22/0.62)]" />
      )}

      {/* Click shields: everything outside the spotlight; the spotlight too unless it's meant to be used */}
      {hole && step.interactive ? (
        <>
          <div className="pointer-events-auto fixed inset-x-0 top-0" style={{ height: hole.top }} />
          <div className="pointer-events-auto fixed inset-x-0 bottom-0" style={{ top: hole.top + hole.height }} />
          <div className="pointer-events-auto fixed left-0" style={{ top: hole.top, height: hole.height, width: hole.left }} />
          <div className="pointer-events-auto fixed right-0" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0" />
      )}

      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={cn(
          "pointer-events-auto fixed flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-float",
          mobile && "max-h-[48vh]",
          anim,
        )}
        style={box}
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
              {t("Step {0} of {1}", { 0: tour.stepIndex + 1, 1: tour.steps.length })}
            </p>
            <h2 ref={headingRef} id={titleId} tabIndex={-1} className="mt-1 font-display text-[17px] font-semibold leading-snug outline-none">
              {t(step.title)}
            </h2>
          </div>
          {/* The page's language switch is under the overlay, so the tour carries its own. */}
          <LanguageSwitch className="h-8 shrink-0 [&_button]:h-6" />
          <button
            onClick={tour.pause}
            className="-mr-1.5 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={t("Close the tour (you can continue later)")}
          >
            <X className="size-4" />
          </button>
        </div>
        <div id={bodyId} className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 text-[13.5px] leading-relaxed text-ink-2">
          <p>{t(step.intro)}</p>
          {step.points && (
            <ul className="mt-2.5 space-y-1.5">
              {step.points.map((p) => (
                <li key={p} className="flex gap-2"><span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />{t(p)}</li>
              ))}
            </ul>
          )}
          {missing && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-muted">{t("This part of the screen isn't available right now, so here's the explanation on its own.")}</p>}
          {searching && <p className="mt-3 text-[12.5px] text-muted" aria-hidden>{t("Opening the page…")}</p>}
        </div>

        {/* progress dots */}
        <div className="flex justify-center gap-1.5 pb-3" aria-hidden>
          {tour.steps.map((s, i) => (
            <span key={s.id} className={cn("h-1.5 rounded-full transition-all", i === tour.stepIndex ? "w-5 bg-primary" : i < tour.stepIndex ? "w-1.5 bg-primary/50" : "w-1.5 bg-line-strong")} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/50 px-4 py-3">
          {isLast ? (
            <>
              <Button variant="ghost" size="sm" onClick={tour.back}><ArrowLeft /> {t("Back")}</Button>
              <div className="ml-auto flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => tour.finish("/dashboard")}>{t("Explore the dashboard")}</Button>
                <Button size="sm" onClick={() => tour.finish("/cases")}>{t("Start managing cases")}</Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={tour.skip}>{t("Skip tour")}</Button>
              <div className="ml-auto flex gap-2">
                {tour.stepIndex > 0 && <Button variant="secondary" size="sm" onClick={tour.back}><ArrowLeft /> {t("Back")}</Button>}
                <Button size="sm" onClick={tour.next}>{t("Next")} <ArrowRight /></Button>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">{t("Step {0} of {1}: {2}", { 0: tour.stepIndex + 1, 1: tour.steps.length, 2: t(step.title) })}</p>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
