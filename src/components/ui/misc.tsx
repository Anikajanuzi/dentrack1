"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { sqNumber } from "@/lib/i18n/config";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line/80 bg-surface shadow-soft", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">{typeof title === "string" ? t(title) : title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{typeof description === "string" ? t(description) : description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-fg [&_svg]:size-5">{icon}</div>}
      <p className="font-display text-[16px] font-semibold text-ink">{t(title)}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] text-muted">{typeof children === "string" ? t(children) : children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Counts up to the value once when it scrolls into view; jumps directly under reduced motion. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const prev = React.useRef(0);
  const { lang } = useI18n();
  const fmt = format ?? ((n: number) => (lang === "sq" ? sqNumber(Math.round(n)) : Math.round(n).toLocaleString("en-IE")));
  const fmtRef = React.useRef(fmt);
  React.useLayoutEffect(() => { fmtRef.current = fmt; });

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduced) {
      el.textContent = fmtRef.current(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.7,
      ease: [0.25, 1, 0.5, 1],
      onUpdate: (v) => (el.textContent = fmtRef.current(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, inView, reduced]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {fmt(reduced ? value : 0)}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}

/**
 * "8 seconds ago"-style time. The server and the browser compute it a moment apart, so the
 * text may legitimately differ by a second at hydration; suppressHydrationWarning covers only
 * this element's text. It refreshes every 30 seconds so it doesn't go stale on screen.
 */
export function RelativeTime({ ts }: { ts: string | Date }) {
  const { fmt } = useI18n();
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={new Date(ts).toISOString()} suppressHydrationWarning>
      {fmt.relative(ts)}
    </time>
  );
}
