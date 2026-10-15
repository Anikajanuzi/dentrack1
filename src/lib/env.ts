import "server-only";

/**
 * Server-side configuration. Nothing here is exposed to the browser.
 *
 * AUTH_PROVIDER=supabase  → Supabase Auth (production). Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * AUTH_PROVIDER=local     → built-in email/password against auth.users in a local PostgreSQL
 *                           (development & CI only; uses the auth shim in supabase/local).
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authProvider(): "supabase" | "local" {
    const p = process.env.AUTH_PROVIDER ?? "supabase";
    if (p !== "supabase" && p !== "local") throw new Error("AUTH_PROVIDER must be 'supabase' or 'local'");
    if (p === "local" && process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_AUTH !== "true") {
      throw new Error("AUTH_PROVIDER=local is for development. Set ALLOW_LOCAL_AUTH=true to override deliberately.");
    }
    return p;
  },
  get sessionSecret() {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  },
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** Optional: only needed to send team invitation emails through Supabase Auth. */
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
};
