"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n-provider";

export interface TooltipRow {
  name: string;
  value: React.ReactNode;
  color?: string;
}

/** Shared tooltip body for Recharts: label + rows with a colored key and text-colored value. */
export function ChartTooltipBox({ label, rows }: { label: React.ReactNode; rows: TooltipRow[] }) {
  const { t } = useI18n();
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-medium text-ink">{typeof label === "string" ? t(label) : label}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className="size-2 rounded-[3px]" style={{ background: r.color }} />}
            {t(r.name)}
          </span>
          <span className="font-medium text-ink tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export const axisProps = {
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {t(i.name)}
        </li>
      ))}
    </ul>
  );
}
