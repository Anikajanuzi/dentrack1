"use client";

import * as React from "react";
import { Tooltip as T } from "radix-ui";

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <T.Provider delayDuration={250} skipDelayDuration={150}>{children}</T.Provider>
);

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-64 rounded-lg bg-navy px-2.5 py-1.5 text-xs leading-snug text-white shadow-lift data-[state=delayed-open]:animate-[menu-in_140ms_ease-out]"
        >
          {content}
          <T.Arrow className="fill-navy" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
