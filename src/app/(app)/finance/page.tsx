import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { getFinance } from "@/lib/data/finance";
import { PageHeader } from "@/components/shell/page-header";
import { FinanceView } from "@/components/finance/finance-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Finance") };
}

export default async function FinancePage() {
  const d = await getFinance();
  return (
    <>
      <PageHeader icon={<Receipt />} title="Finance" description="Invoices, payments received and operating expenses. Billing, revenue and cash are tracked separately." />
      <Suspense><FinanceView d={d} /></Suspense>
    </>
  );
}
