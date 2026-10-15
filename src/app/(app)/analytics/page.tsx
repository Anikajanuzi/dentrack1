import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { getAnalytics } from "@/lib/data/analytics";
import { PageHeader } from "@/components/shell/page-header";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Analytics") };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const d = await getAnalytics(await searchParams);
  return (
    <>
      <PageHeader icon={<BarChart3 />}
        title="Analytics"
        description={d.isAdmin ? "Production performance and the laboratory's finances, calculated from recorded data." : "Production performance calculated from recorded cases."}
      />
      <Suspense><AnalyticsView d={d} /></Suspense>
    </>
  );
}
