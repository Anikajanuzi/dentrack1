"use client";


import { useI18n } from "@/components/i18n-provider";import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger"><TriangleAlert className="size-5" /></div>
      <h1 className="type-title">{t("This page couldn't load")}</h1>
      <p className="mt-1 max-w-md text-[13px] text-muted">
        {t("The server returned an error{0}. Your data hasn't changed. Try again, and if it keeps happening check the database connection.", { 0: error.digest ? ` (${error.digest})` : "" })}
      </p>
      <Button className="mt-5" onClick={reset}>{t("Try again")}</Button>
    </div>
  );
}
