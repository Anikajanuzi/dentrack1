"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signUp } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { useI18n } from "@/components/i18n-provider";

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(72),
});
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const { t } = useI18n();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<Values>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (v) => {
    setMsg(null);
    const r = await signUp(v);
    if (!r) return;
    if (r.ok) setMsg({ ok: true, text: r.message ?? "Account created." });
    else {
      setMsg({ ok: false, text: r.error });
      Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {msg && (
        <div role="alert" className={msg.ok ? "rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] text-ink" : "rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"}>
          {t(msg.text)}
        </div>
      )}
      <Field label="Full name" htmlFor="fullName" error={formState.errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" className="h-10" aria-invalid={!!formState.errors.fullName} {...register("fullName")} />
      </Field>
      <Field label="Work email" htmlFor="email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={formState.errors.password?.message} hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" loading={formState.isSubmitting}>{t("Create account")}</Button>
    </form>
  );
}
