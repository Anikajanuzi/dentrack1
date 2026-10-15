"use client";

import * as React from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { signIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { PasswordInput } from "@/components/auth/password-input";
import { useI18n } from "@/components/i18n-provider";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const { t } = useI18n();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const r = await signIn({ ...v, next });
    if (r && !r.ok) setError(r.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <AnimatePresence>
        {(error || notice) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className={error ? "flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger" : "rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2"}
          >
            {error && <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
            {t(error ?? notice)}
          </motion.div>
        )}
      </AnimatePresence>
      <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
        <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <Controller
            control={control}
            name="remember"
            render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-label={t("Keep me signed in")} />}
          />
          {t("Keep me signed in")}
        </label>
        <Link href="/forgot-password" className="text-[13px] font-medium text-primary hover:underline">{t("Forgot password?")}</Link>
      </div>
      <Button type="submit" size="lg" className="mt-1 w-full rounded-xl" loading={formState.isSubmitting}>
        {t("Sign in")}
      </Button>
    </form>
  );
}
