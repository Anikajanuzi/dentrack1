"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TrayVisual, type TrayState } from "@/components/trays/tray-visual";
import { useI18n } from "@/components/i18n-provider";

// A small, quiet loop on the login screen: cases settle into trays and leave again,
// the way they move through a real bench. One orchestrated moment, slow cadence.
const START: TrayState[] = ["occupied", "available", "occupied", "occupied", "available", "occupied"];

export function AuthShowcase() {
  const reduced = useReducedMotion();
  const { t } = useI18n();
  const [states, setStates] = React.useState(START);
  React.useEffect(() => {
    if (reduced) return;
    let i = 0;
    const order = [1, 3, 4, 0, 5, 2];
    const t = setInterval(() => {
      const idx = order[i++ % order.length];
      setStates((s) => s.map((v, j) => (j === idx ? (v === "occupied" ? "available" : "occupied") : v)));
    }, 2200);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div className="grid grid-cols-3 gap-3" aria-hidden>
      {states.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="rounded-2xl bg-white/[0.05] p-2 ring-1 ring-white/[0.08] backdrop-blur-sm"
        >
          <TrayVisual number={i + 1} state={s} idSuffix="-auth" />
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px]">
            <span className="font-semibold text-slate-300 tabular">#{String(i + 1).padStart(3, "0")}</span>
            <span className={s === "occupied" ? "text-teal" : "text-emerald-400"}>{t(s === "occupied" ? "Occupied" : "Available")}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
