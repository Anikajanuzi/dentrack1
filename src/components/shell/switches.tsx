"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useI18n, useSetLanguage } from "@/components/i18n-provider";
import type { Lang } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

function applyTheme(t: Theme | "system") {
  try { localStorage.setItem("dt-theme", t); } catch {}
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Two-position light / dark switch with a sliding thumb. */
export function ThemeSwitch({ onChange, className, tone = "default" }: { onChange?: (t: Theme) => void; className?: string; tone?: "default" | "onDark" }) {
  const { t } = useI18n();
  const [theme, setTheme] = React.useState<Theme>("light");
  React.useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    const obs = new MutationObserver(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const choose = (v: Theme) => { setTheme(v); applyTheme(v); onChange?.(v); };

  return (
    <div
      role="radiogroup"
      aria-label={t("Theme")}
      className={cn(
        "relative flex h-9 items-center rounded-full p-1",
        tone === "onDark" ? "bg-white/10 ring-1 ring-white/15" : "bg-surface-2 ring-1 ring-line",
        className,
      )}
    >
      {(["light", "dark"] as const).map((v) => {
        const active = theme === v;
        const Icon = v === "light" ? Sun : Moon;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={active}
            aria-label={t(v === "light" ? "Light mode" : "Dark mode")}
            title={t(v === "light" ? "Light mode" : "Dark mode")}
            onClick={() => choose(v)}
            className={cn(
              "relative z-10 flex h-7 w-8 items-center justify-center rounded-full transition-colors",
              active ? (v === "light" ? "text-amber-600" : "text-teal") : tone === "onDark" ? "text-white/60 hover:text-white" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`theme-thumb-${tone}`}
                className="absolute inset-0 rounded-full bg-surface shadow-soft ring-1 ring-line dark:bg-deep"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <Icon className="relative size-4" />
          </button>
        );
      })}
    </div>
  );
}

/** English / Albanian language switch. */
export function LanguageSwitch({ className, tone = "default" }: { className?: string; tone?: "default" | "onDark" }) {
  const { lang, t } = useI18n();
  const { setLanguage, pending } = useSetLanguage();
  const items: Array<{ v: Lang; short: string; long: string }> = [
    { v: "en", short: "EN", long: "English" },
    { v: "sq", short: "SQ", long: "Shqip" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("Language")}
      aria-busy={pending || undefined}
      className={cn(
        "relative flex h-9 items-center rounded-full p-1 transition-opacity",
        tone === "onDark" ? "bg-white/10 ring-1 ring-white/15" : "bg-surface-2 ring-1 ring-line",
        pending && "opacity-60",
        className,
      )}
    >
      {items.map((it) => {
        const active = lang === it.v;
        return (
          <button
            key={it.v}
            role="radio"
            aria-checked={active}
            aria-label={it.long}
            title={it.long}
            lang={it.v}
            onClick={() => !active && setLanguage(it.v)}
            className={cn(
              "relative z-10 flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-[12px] font-semibold tracking-wide transition-colors",
              active ? "text-ink" : tone === "onDark" ? "text-white/60 hover:text-white" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`lang-thumb-${tone}`}
                className="absolute inset-0 rounded-full bg-surface shadow-soft ring-1 ring-line dark:bg-deep"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{it.short}</span>
          </button>
        );
      })}
    </div>
  );
}
