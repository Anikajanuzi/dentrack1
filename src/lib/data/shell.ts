import "server-only";
import { withLab } from "@/lib/auth/context";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export async function getNotifications() {
  return withLab(async (tx, ctx) => {
    // Idempotent: creates at most one due-soon/overdue notice per case, due date and user.
    await tx`select generate_deadline_notifications(${ctx.lab.id})`;
    const items = await tx<NotificationRow[]>`
      select id, type, title, body, link, read_at, created_at from notifications
      where laboratory_id = ${ctx.lab.id} and user_id = ${ctx.user.id}
      order by created_at desc limit 30`;
    const [{ unread }] = await tx<{ unread: number }[]>`
      select count(*)::int as unread from notifications where laboratory_id = ${ctx.lab.id} and user_id = ${ctx.user.id} and read_at is null`;
    return { items, unread };
  });
}
