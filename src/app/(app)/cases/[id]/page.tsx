import type { Metadata } from "next";
import { Suspense } from "react";
import { getCase } from "@/lib/data/cases";
import { CaseDetail } from "@/components/cases/case-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await getCase(id);
  return { title: d.c.reference };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCase(id);
  return (
    <Suspense>
      <CaseDetail data={data} />
    </Suspense>
  );
}
