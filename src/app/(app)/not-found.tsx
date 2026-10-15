import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="py-24 text-center">
      <h1 className="type-title">{t("Not found")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("This record doesn't exist or you don't have access to it.")}</p>
      <Link href="/dashboard" className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline">{t("Back to the dashboard")}</Link>
    </div>
  );
}
