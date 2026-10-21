"use client";

import { useI18n } from "@/components/i18n-provider";
import type { Vars } from "@/lib/i18n/translate";

/**
 * Translated text inside a server component. Rendered in the browser, so it switches language
 * instantly with the rest of the interface instead of waiting for a server round trip.
 */
export function T({ k, vars }: { k: string; vars?: Vars }) {
  const { t } = useI18n();
  return <>{t(k, vars)}</>;
}
