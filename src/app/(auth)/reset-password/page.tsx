"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "../actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { useI18n } from "@/components/i18n-provider";

function ResetForm() {
  const token = useSearchParams().get("token") ?? undefined;
  const { t } = useI18n();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [state, setState] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await resetPassword({ password, confirm, token });
    setBusy(false);
    setState(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: Object.values(r.fieldErrors ?? {})[0] ?? r.error });
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {state && (
        <div role="alert" className={state.ok ? "rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] text-ink" : "rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"}>
          {t(state.text)} {state.ok && <Link href="/login" className="font-medium text-primary hover:underline">{t("Sign in")}</Link>}
        </div>
      )}
      <Field label="New password" htmlFor="pw" hint="At least 8 characters.">
        <PasswordInput id="pw" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repeat new password" htmlFor="pw2">
        <PasswordInput id="pw2" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={state?.ok}>{t("Save new password")}</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return <ResetShell />;
}

function ResetShell() {
  const { t } = useI18n();
  return (
    <>
      <h2 className="type-display">{t("Choose a new password")}</h2>
      <p className="mb-7 mt-1.5 text-[14px] text-muted">{t("You'll use it the next time you sign in.")}</p>
      <React.Suspense><ResetForm /></React.Suspense>
    </>
  );
}
