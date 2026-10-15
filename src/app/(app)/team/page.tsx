import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { getTeam } from "@/lib/data/team";
import { PageHeader } from "@/components/shell/page-header";
import { TeamView } from "@/components/team/team-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Technicians") };
}

export default async function TeamPage() {
  const d = await getTeam();
  return (
    <>
      <PageHeader icon={<Users />} title="Technicians" description="Who is working on what, and what's due next." />
      <TeamView d={d} />
    </>
  );
}
