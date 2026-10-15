"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requestPasswordReset } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await requestPasswordReset({ email });
    setBusy(false);
    setState(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.fieldErrors?.email ?? r.error });
  }
  return (
    <>
      <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("Back to sign in")}</Link>
      <h2 className="type-display">{t("Reset your password")}</h2>
      <p className="mb-7 mt-1.5 text-[14px] text-muted">{t("We'll email you a link to choose a new password.")}</p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {state && (
          <div role="alert" className={state.ok ? "rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] text-ink" : "rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"}>
            {t(state.text)}
          </div>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" required />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("Send reset link")}</Button>
      </form>
    </>
  );
}
