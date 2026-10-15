import type { Metadata } from "next";
import { Archive } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { listCases } from "@/lib/data/cases";
import { PageHeader } from "@/components/shell/page-header";
import { CaseTable } from "@/components/cases/case-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Archive") };
}

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const data = await listCases({ ...sp, archived: true, status: "all", page: Number(sp.page ?? 1) });
  return (
    <>
      <PageHeader icon={<Archive />}
        title="Archive"
        description="Delivered and cancelled cases you've archived. Their tray history, costs, invoices and payments stay intact and are counted once in analytics. Administrators can restore a case from its page."
      />
      <Suspense><CaseTable {...data} options={data.options} archived /></Suspense>
    </>
  );
}
