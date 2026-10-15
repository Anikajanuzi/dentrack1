import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getDashboard } from "@/lib/data/dashboard";
import { DashboardView } from "./dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Dashboard") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [d, sp] = await Promise.all([getDashboard(), searchParams]);
  return <DashboardView d={d} denied={sp.denied === "1"} />;
}
