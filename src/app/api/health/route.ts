import { NextResponse } from "next/server";
import postgres from "postgres";
import { checkConfig } from "@/lib/config-check";

/**
 * Deployment self-check: GET /api/health
 *
 * Reports whether the settings are present and whether the database is reachable and set up.
 * It never returns secret values (no URLs, keys or passwords) and needs no sign-in, so it can be
 * used to diagnose a deployment that fails before anyone can log in.
 */
export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail?: string };

// Error text from the driver can include the host; strip anything that looks like a connection string.
const scrub = (s: string) => s.replace(/postgres(ql)?:\/\/\S+/gi, "postgres://…").slice(0, 300);

function hint(e: { code?: string; message?: string }): string {
  const m = `${e.code ?? ""} ${e.message ?? ""}`;
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return "Database host not found. Check the host in DATABASE_URL (use the Supabase Transaction pooler string).";
  if (/ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|timeout|CONNECT_TIMEOUT/i.test(m)) return "Database did not answer. On Vercel, use the Supabase Transaction pooler (…pooler.supabase.com:6543), not the direct db.… host.";
  if (/ECONNREFUSED/.test(m)) return "Connection refused. DATABASE_URL may point to localhost or a wrong port.";
  if (/28P01|password authentication failed/i.test(m)) return "Wrong database password in DATABASE_URL (URL-encode special characters).";
  if (/Tenant or user not found|XX000/i.test(m)) return "Supabase pooler doesn't recognise the user. The user should look like postgres.<project-ref>.";
  if (/3D000/.test(m)) return "Database name not found. It should end in /postgres.";
  return scrub(e.message ?? String(e));
}

export async function GET() {
  const config = checkConfig();
  const checks: Check[] = [];
  const errors = config.filter((c) => c.level === "error");
  checks.push({
    name: "settings",
    ok: errors.length === 0,
    detail: config.length ? config.map((c) => `${c.level}: ${c.variable} — ${c.message}`).join(" | ") : "All required variables are set.",
  });

  if (process.env.DATABASE_URL && !config.some((c) => c.variable === "DATABASE_URL" && c.level === "error")) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 8, idle_timeout: 2 });
    try {
      await sql`select 1`;
      checks.push({ name: "database connection", ok: true });

      const [t] = await sql<{ labs: string | null; profiles: string | null; users: string | null; fn: string | null }[]>`
        select to_regclass('public.laboratories')::text as labs,
               to_regclass('public.profiles')::text as profiles,
               to_regclass('auth.users')::text as users,
               to_regprocedure('public.money_as_text(jsonb)')::text as fn`;
      const missing = [!t.users && "auth.users (is this a Supabase database?)", !t.labs && "public.laboratories", !t.profiles && "public.profiles", !t.fn && "migration 0007 (money_as_text)"].filter(Boolean);
      checks.push({
        name: "database tables (migrations)",
        ok: missing.length === 0,
        detail: missing.length ? `Missing: ${missing.join(", ")}. Run every file in supabase/migrations in order (0001 → 0007).` : "All migrations applied.",
      });

      // The app runs each request as the `authenticated` role so Row Level Security applies.
      await sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
      });
      checks.push({ name: "row level security role", ok: true });
    } catch (e) {
      checks.push({ name: checks.some((c) => c.name === "database connection") ? "database setup" : "database connection", ok: false, detail: hint(e as { code?: string; message?: string }) });
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  }

  if ((process.env.AUTH_PROVIDER ?? "supabase") === "supabase" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      checks.push({
        name: "supabase auth",
        ok: r.ok,
        detail: r.ok ? undefined : r.status === 401 ? "Supabase rejected the anon key. Copy NEXT_PUBLIC_SUPABASE_ANON_KEY again." : `Supabase answered ${r.status}.`,
      });
    } catch {
      checks.push({ name: "supabase auth", ok: false, detail: "Couldn't reach NEXT_PUBLIC_SUPABASE_URL. Check the project URL." });
    }
  }

  const ok = checks.every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
