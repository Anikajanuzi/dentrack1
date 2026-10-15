"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

/** Centered modal. Animated scale/fade in, respects reduced motion via MotionConfig. */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: DialogProps) {
  const { t } = useI18n();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-navy/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </D.Overlay>
            <D.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cn(
                  "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col rounded-3xl border border-line bg-surface shadow-float outline-none",
                  size === "sm" && "max-w-md",
                  size === "md" && "max-w-lg",
                  size === "lg" && "max-w-2xl",
                )}
                initial={{ opacity: 0, scale: 0.96, x: "-50%", y: "-48%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.97, x: "-50%", y: "-49%" }}
                transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <D.Title className="type-title">{t(title)}</D.Title>
                    {description ? (
                      <D.Description className="mt-1 text-[13px] text-muted">{typeof description === "string" ? t(description) : description}</D.Description>
                    ) : (
                      <D.Description className="sr-only">{t(title)}</D.Description>
                    )}
                  </div>
                  <D.Close className="-mr-1 rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink" aria-label={t("Close")}>
                    <X className="size-4" />
                  </D.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
              </motion.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}

/** Right-hand detail panel (full-height sheet; bottom sheet on phones). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: Omit<DialogProps, "size">) {
  const { t } = useI18n();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-navy/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </D.Overlay>
            <D.Content asChild forceMount>
              <motion.aside
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-line bg-surface shadow-float outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:border-l"
                initial={{ opacity: 0.6, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.26, ease: [0.25, 1, 0.5, 1] }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <D.Title className="type-title">{t(title)}</D.Title>
                    {description ? (
                      <D.Description asChild>
                        <div className="mt-1 text-[13px] text-muted">{typeof description === "string" ? t(description) : description}</div>
                      </D.Description>
                    ) : (
                      <D.Description className="sr-only">{t(title)}</D.Description>
                    )}
                  </div>
                  <D.Close className="-mr-1 rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink" aria-label={t("Close panel")}>
                    <X className="size-4" />
                  </D.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
                {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">{footer}</div>}
              </motion.aside>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}
