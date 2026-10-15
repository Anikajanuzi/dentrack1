import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getTechnician } from "@/lib/data/team";
import { TechnicianDetail } from "@/components/team/technician-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Technician") };
}

export default async function TechnicianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TechnicianDetail d={await getTechnician(id)} />;
}
