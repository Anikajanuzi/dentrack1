import type { Metadata } from "next";
import { Grid3x3 } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { getTrayBoard } from "@/lib/data/trays";
import { TrayBoard } from "@/components/trays/tray-board";
import { PageHeader } from "@/components/shell/page-header";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Tray board") };
}

export default async function TraysPage() {
  const data = await getTrayBoard();
  return (
    <>
      <PageHeader icon={<Grid3x3 />}
        title="Tray board"
        description="Every numbered tray on the bench. Select a tray to place a case, check its work, or release it once it's empty."
      />
      <Suspense>
        <TrayBoard {...data} />
      </Suspense>
    </>
  );
}
