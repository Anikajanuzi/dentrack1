"use client";

import * as React from "react";
import { Tabs as T } from "radix-ui";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

export const Tabs = T.Root;
export const TabsContent = ({ className, ...p }: React.ComponentProps<typeof T.Content>) => (
  <T.Content className={cn("outline-none data-[state=active]:animate-[tab-in_220ms_cubic-bezier(.25,1,.5,1)]", className)} {...p} />
);

/** Underline tabs with an animated active indicator. */
export function TabsList({
  items,
  value,
  id,
  className,
}: {
  items: Array<{ value: string; label: React.ReactNode; badge?: React.ReactNode }>;
  value: string;
  id: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <T.List className={cn("relative flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {items.map((it) => (
        <T.Trigger
          key={it.value}
          value={it.value}
          className="relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-[13px] font-medium text-muted outline-none transition-colors hover:text-ink data-[state=active]:text-ink focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          {typeof it.label === "string" ? t(it.label) : it.label}
          {it.badge}
          {value === it.value && (
            <motion.span
              layoutId={`tab-indicator-${id}`}
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
        </T.Trigger>
      ))}
    </T.List>
  );
}
