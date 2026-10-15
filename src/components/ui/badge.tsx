"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n-provider";
import { CircleCheck, CircleDot, Clock, TriangleAlert, Archive, Circle, Ban, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "occupied" | "warn" | "danger" | "neutral" | "info" | "plain";

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  occupied: "bg-occupied-soft text-occupied",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
  info: "bg-info-soft text-info",
  plain: "bg-surface-2 text-ink-2",
};

export function Badge({ tone = "plain", icon, children, className }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium [&_svg]:size-3.5", toneClass[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Status with icon + text so meaning never depends on color alone. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useI18n();
  const map: Record<string, { tone: Tone; icon: React.ReactNode; label: string }> = {
    available: { tone: "ok", icon: <Circle />, label: "Available" },
    occupied: { tone: "occupied", icon: <CircleDot />, label: "Occupied" },
    inactive: { tone: "neutral", icon: <Ban />, label: "Inactive" },
    due_soon: { tone: "warn", icon: <Clock />, label: "Due soon" },
    overdue: { tone: "danger", icon: <TriangleAlert />, label: "Overdue" },
    active: { tone: "info", icon: <CircleDot />, label: "In production" },
    completed: { tone: "ok", icon: <CircleCheck />, label: "Completed" },
    delivered: { tone: "ok", icon: <PackageCheck />, label: "Delivered" },
    cancelled: { tone: "neutral", icon: <Ban />, label: "Cancelled" },
    archived: { tone: "neutral", icon: <Archive />, label: "Archived" },
    paid: { tone: "ok", icon: <CircleCheck />, label: "Paid" },
    partially_paid: { tone: "warn", icon: <Clock />, label: "Partially paid" },
    unpaid: { tone: "danger", icon: <Circle />, label: "Unpaid" },
    draft: { tone: "plain", icon: <Circle />, label: "Draft" },
    void: { tone: "neutral", icon: <Ban />, label: "Void" },
  };
  const s = map[status] ?? { tone: "plain" as Tone, icon: null, label: status };
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {t(s.label)}
    </Badge>
  );
}

const priorityMap = {
  low: { label: "Low", tone: "plain" },
  normal: { label: "Normal", tone: "plain" },
  high: { label: "High", tone: "warn" },
  urgent: { label: "Urgent", tone: "danger" },
} as const;

export function PriorityBadge({ priority }: { priority: keyof typeof priorityMap }) {
  const { t } = useI18n();
  if (priority === "normal" || priority === "low") return null;
  const p = priorityMap[priority];
  return <Badge tone={p.tone}>{t(p.label)}</Badge>;
}
