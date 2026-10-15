import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { listCases } from "@/lib/data/cases";
import { PageHeader } from "@/components/shell/page-header";
import { CaseTable } from "@/components/cases/case-table";
import { buttonVariants } from "@/components/ui/button-variants";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Cases") };
}

type SP = Promise<Record<string, string | undefined>>;

export default async function CasesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const t = await getT();
  const data = await listCases({ ...sp, page: Number(sp.page ?? 1) });
  return (
    <>
      <PageHeader icon={<ClipboardList />}
        title="Cases"
        description="Every prosthetic case in the laboratory. Delivered and cancelled cases move to the archive when you archive them."
        actions={<Link href="/cases/new" className={buttonVariants()}><Plus /> {t("New case")}</Link>}
      />
      <Suspense>
        <CaseTable {...data} options={data.options} />
      </Suspense>
    </>
  );
}
