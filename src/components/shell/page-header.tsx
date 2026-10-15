"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n-provider";

export function PageHeader({ title, description, actions, icon }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {icon && (
          <span className="mt-0.5 hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal/20 to-ice/60 text-primary ring-1 ring-teal/20 sm:flex dark:from-teal/25 dark:to-teal/5 [&_svg]:size-6">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="type-display text-ink">{t(title)}</h1>
          {description && <p className="mt-1 max-w-2xl text-[14px] text-muted">{typeof description === "string" ? t(description) : description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
