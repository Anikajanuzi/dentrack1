import * as React from "react";

/** DENTRACK mark: a lab tray seen from above, with an upper and lower arch in its two compartments. */
export function BrandMark({ className }: { className?: string }) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3fd6cd" />
          <stop offset="1" stopColor="#0f8f89" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${id}-g)`} />
      <rect x="10" y="17" width="44" height="30" rx="8" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="3" />
      <path d="M32 20v24" stroke="#fff" strokeOpacity=".9" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16.5 40c0-8 2.4-12 5.5-12s5.5 4 5.5 12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M36.5 28c0 8 2.4 12 5.5 12s5.5-4 5.5-12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
