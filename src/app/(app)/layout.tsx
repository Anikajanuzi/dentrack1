// Every screen is per-user and reads live database state.
export const dynamic = "force-dynamic";

import { getContext } from "@/lib/auth/context";
import { getNotifications } from "@/lib/data/shell";
import { AppShell } from "@/components/shell/app-shell";
import { getTutorialState } from "@/lib/data/tutorial";
import { TourProvider } from "@/components/tutorial/tour-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const [notifications, tutorial] = await Promise.all([getNotifications(), getTutorialState(ctx.user.id, ctx.lab.id)]);
  return (
    <TourProvider key={ctx.lab.id} userId={ctx.user.id} labId={ctx.lab.id} isAdmin={ctx.isAdmin} initial={tutorial}>
    <AppShell
      user={{ fullName: ctx.user.fullName, email: ctx.user.email, theme: ctx.user.theme, reducedMotion: ctx.user.reducedMotion }}
      lab={{ id: ctx.lab.id, name: ctx.lab.name, is_demo: ctx.lab.is_demo }}
      labs={ctx.labs}
      role={ctx.role}
      notifications={notifications}
    >
      {children}
    </AppShell>
    </TourProvider>
  );
}
