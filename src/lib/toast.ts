"use client";

import { toast as sonner } from "sonner";
import { translate } from "@/lib/i18n/translate";
import { getClientLang } from "@/lib/i18n/client-lang";

/** Toasts translate their message into the current interface language. */
const tr = (m: unknown) => (typeof m === "string" ? translate(getClientLang(), m) : (m as string));

export const toast = {
  success: (m: unknown) => sonner.success(tr(m)),
  error: (m: unknown) => sonner.error(tr(m)),
  message: (m: unknown) => sonner(tr(m)),
};
