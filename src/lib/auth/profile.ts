import "server-only";
import { asSystem } from "@/lib/db";
import type { SessionUser } from "./session";

/**
 * Make sure a signed-in user has a profile row.
 *
 * Normally the `on_auth_user_created` trigger (migration 0002) creates it at sign-up. Accounts
 * created before the migrations were applied — e.g. signed up while the deployment was still
 * being configured, or added in the Supabase dashboard first — have no profile. Without one the
 * app can't load the user, so this performs the same work as the trigger, once: create the profile
 * and accept any pending invitations for the user's email.
 *
 * Does nothing for users who already have a profile.
 *
 * Runs with the server's database connection (auth plumbing only, like local sign-in), scoped to the
 * already-verified user id. Idempotent: safe to call concurrently or repeatedly.
 */
export async function ensureProfile(user: SessionUser): Promise<boolean> {
  return asSystem((sql) =>
    sql.begin(async (tx) => {
      const [authUser] = await tx<{ id: string; email: string | null; name: string }[]>`
        select u.id, u.email,
               coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)) as name
        from auth.users u where u.id = ${user.id}`;
      if (!authUser) return false;

      const created = await tx`
        insert into public.profiles (id, email, full_name)
        values (${authUser.id}, ${authUser.email}, ${authUser.name})
        on conflict (id) do nothing
        returning id`;
      // Profile already existed: nothing to repair. (Like the trigger, invitations are only
      // accepted when the profile is first created.)
      if (created.length === 0) return true;

      const invitations = await tx<{ id: string; laboratory_id: string; role: string; can_manage_costs: boolean; technician_id: string | null }[]>`
        select id, laboratory_id, role, can_manage_costs, technician_id
        from public.lab_invitations
        where lower(email) = lower(${authUser.email ?? ""}) and accepted_at is null
        for update`;
      for (const inv of invitations) {
        await tx`
          insert into public.laboratory_memberships (laboratory_id, user_id, role, can_manage_costs)
          values (${inv.laboratory_id}, ${authUser.id}, ${inv.role}::public.member_role, ${inv.can_manage_costs})
          on conflict (laboratory_id, user_id) do nothing`;
        if (inv.technician_id) {
          await tx`update public.technicians set user_id = ${authUser.id} where id = ${inv.technician_id} and user_id is null`;
        } else if (inv.role === "technician") {
          await tx`
            insert into public.technicians (laboratory_id, user_id, full_name)
            values (${inv.laboratory_id}, ${authUser.id}, ${authUser.name})
            on conflict (laboratory_id, user_id) do nothing`;
        }
        await tx`update public.lab_invitations set accepted_at = now() where id = ${inv.id}`;
        await tx`
          update public.profiles set active_laboratory_id = coalesce(active_laboratory_id, ${inv.laboratory_id})
          where id = ${authUser.id}`;
      }
      return true;
    }),
  );
}
