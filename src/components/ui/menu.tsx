"use client";

import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuLabel = ({ className, ...p }: React.ComponentProps<typeof M.Label>) => (
  <M.Label className={cn("px-2.5 py-1.5 text-xs text-muted", className)} {...p} />
);
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) rounded-xl border border-line bg-surface p-1 shadow-lift",
          "data-[state=open]:animate-[menu-in_160ms_cubic-bezier(.25,1,.5,1)] data-[state=closed]:animate-[menu-out_120ms_ease-in]",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({ className, destructive, ...props }: React.ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 outline-none transition-colors data-disabled:opacity-50 data-highlighted:bg-surface-2 data-highlighted:text-ink [&_svg]:size-4 [&_svg]:text-muted",
        destructive && "text-danger data-highlighted:bg-danger-soft data-highlighted:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}
