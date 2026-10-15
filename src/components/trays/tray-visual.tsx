"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn, trayCode } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

export type TrayState = "available" | "occupied" | "inactive";
export type Urgency = "overdue" | "due_soon" | "ok" | "done" | null;

/**
 * A numbered stainless-steel laboratory tray, drawn in SVG.
 * Two flat compartments separated by a vertical divider, engraved UPPER / LOWER labels and
 * an engraved tray number. When a case is placed, stylised dental arches settle into both
 * compartments — the digital twin of the physical work sitting in the tray.
 */
export function TrayVisual({
  number,
  state,
  urgency,
  className,
  compact,
  idSuffix = "",
}: {
  number: number;
  state: TrayState;
  urgency?: Urgency;
  className?: string;
  compact?: boolean;
  idSuffix?: string;
}) {
  const { t } = useI18n();
  const gid = `t${number}${idSuffix}`;
  const occupied = state === "occupied";
  const inactive = state === "inactive";
  const led =
    inactive ? "var(--neutral)" : !occupied ? "var(--ok)" : urgency === "overdue" ? "var(--danger)" : urgency === "due_soon" ? "var(--warn)" : "var(--occupied)";

  return (
    <svg
      viewBox="0 0 200 136"
      className={cn("block h-auto w-full", inactive && "opacity-55 saturate-0", className)}
      role="img"
      aria-label={t("Tray {0}, {1}", { 0: trayCode(number), 1: t(state) })}
    >
      <defs>
        <linearGradient id={`${gid}-steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--metal-1)" />
          <stop offset="0.55" stopColor="var(--metal-2)" />
          <stop offset="1" stopColor="var(--metal-3)" />
        </linearGradient>
        <linearGradient id={`${gid}-well`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--metal-3)" />
          <stop offset="0.18" stopColor="var(--metal-2)" />
          <stop offset="1" stopColor="var(--metal-1)" />
        </linearGradient>
        <pattern id={`${gid}-brush`} width="3" height="136" patternUnits="userSpaceOnUse">
          <rect width="1" height="136" fill="white" opacity="0.07" />
        </pattern>
        <linearGradient id={`${gid}-model`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ice)" />
          <stop offset="1" stopColor="#b9e7e4" />
        </linearGradient>
      </defs>

      {/* Body */}
      <rect x="3" y="4" width="194" height="128" rx="20" fill="var(--metal-edge)" opacity="0.55" />
      <rect x="3" y="2" width="194" height="128" rx="20" fill={`url(#${gid}-steel)`} />
      <rect x="3" y="2" width="194" height="128" rx="20" fill={`url(#${gid}-brush)`} />
      <rect x="3.5" y="2.5" width="193" height="127" rx="19.5" fill="none" stroke="white" strokeOpacity="0.55" />

      {/* Engraved number: dark cut with a light lower lip */}
      <g fontFamily="var(--font-geist-sans)" fontWeight="700" letterSpacing="0.5">
        <text x="17" y="25.6" fontSize="15" fill="white" fillOpacity="0.6">{trayCode(number)}</text>
        <text x="17" y="24.6" fontSize="15" fill="var(--metal-engrave)">{trayCode(number)}</text>
      </g>

      {/* Status lamp */}
      <circle cx="181" cy="19" r="5.5" fill="var(--metal-3)" />
      <circle cx="181" cy="19" r="3.8" fill={led}>
        {occupied && urgency === "overdue" && (
          <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" />
        )}
      </circle>

      {/* Compartments */}
      {[0, 1].map((i) => {
        const x = i === 0 ? 13 : 104;
        return (
          <g key={i}>
            <rect x={x} y="34" width="83" height="86" rx="11" fill={`url(#${gid}-well)`} />
            <rect x={x + 0.5} y="34.5" width="82" height="85" rx="10.5" fill="none" stroke="var(--metal-edge)" strokeOpacity="0.45" />
            <path d={`M${x + 11} 119.5 h61`} stroke="white" strokeOpacity="0.5" />
            <g fontFamily="var(--font-geist-sans)" fontWeight="650" fontSize="7.5" letterSpacing="1.6" textAnchor="middle">
              <text x={x + 41.5} y="113.6" fill="white" fillOpacity="0.55">{i === 0 ? "UPPER" : "LOWER"}</text>
              <text x={x + 41.5} y="112.8" fill="var(--metal-engrave)" fillOpacity="0.85">{i === 0 ? "UPPER" : "LOWER"}</text>
            </g>
          </g>
        );
      })}
      {/* Vertical divider */}
      <rect x="98.2" y="31" width="3.6" height="92" rx="1.8" fill="var(--metal-3)" />
      <rect x="98.2" y="31" width="1.4" height="92" rx="0.7" fill="white" fillOpacity="0.6" />

      {/* Work in the tray: upper arch (opens down) and lower arch (opens up) */}
      <AnimatePresence initial={false}>
        {occupied && (
          <motion.g
            key="work"
            initial={{ opacity: 0, y: -14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            style={{ transformOrigin: "100px 76px" }}
          >
            <g transform="translate(54.5 72)">
              <ellipse cx="0" cy="22" rx="27" ry="5" fill="black" opacity="0.10" />
              <path d="M-24 18 C-24 -14 -10 -26 0 -26 C10 -26 24 -14 24 18" fill="none" stroke={`url(#${gid}-model)`} strokeWidth="10" strokeLinecap="round" />
              <path d="M-24 18 C-24 -14 -10 -26 0 -26 C10 -26 24 -14 24 18" fill="none" stroke="var(--teal)" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4.5 3.2" />
            </g>
            <g transform="translate(145.5 70)">
              <ellipse cx="0" cy="24" rx="27" ry="5" fill="black" opacity="0.10" />
              <path d="M-24 -18 C-24 14 -10 26 0 26 C10 26 24 14 24 -18" fill="none" stroke={`url(#${gid}-model)`} strokeWidth="10" strokeLinecap="round" />
              <path d="M-24 -18 C-24 14 -10 26 0 26 C10 26 24 14 24 -18" fill="none" stroke="var(--teal)" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4.5 3.2" />
            </g>
          </motion.g>
        )}
      </AnimatePresence>

      {inactive && !compact && (
        <path d="M30 120 L170 16" stroke="var(--metal-engrave)" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}
