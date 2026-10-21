/**
 * Deployment configuration check. Reads only environment variable *presence and shape* —
 * never returns their values — so the result is safe to show on a setup page.
 *
 * Used by the request proxy (to show a setup page instead of crashing with a bare 500) and by
 * /api/health. No server-only imports: the proxy can use it.
 */
export type ConfigIssue = {
  variable: string;
  /** "error" stops the app from working; "warning" is likely to cause problems later. */
  level: "error" | "warning";
  message: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function checkConfig(env: Record<string, string | undefined> = process.env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const onVercel = Boolean(env.VERCEL);
  const production = env.NODE_ENV === "production";
  const provider = env.AUTH_PROVIDER ?? "supabase";

  // ── Authentication ──────────────────────────────────────────
  if (provider !== "supabase" && provider !== "local") {
    issues.push({ variable: "AUTH_PROVIDER", level: "error", message: "Must be \"supabase\" (or \"local\" for development only)." });
  } else if (provider === "supabase") {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      issues.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", level: "error", message: "Missing. Supabase → Project Settings → API → Project URL." });
    } else if (!/^https:\/\/[^/\s]+$/.test(url.replace(/\/$/, ""))) {
      issues.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", level: "error", message: "Should look like https://<project-ref>.supabase.co (no path, no quotes)." });
    }
    if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      issues.push({ variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", level: "error", message: "Missing. Supabase → Project Settings → API → anon public key." });
    }
  } else {
    if (production && env.ALLOW_LOCAL_AUTH !== "true") {
      issues.push({ variable: "AUTH_PROVIDER", level: "error", message: "\"local\" is for development. Use \"supabase\" on a live deployment." });
    }
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      issues.push({ variable: "SESSION_SECRET", level: "error", message: "Local login needs a secret of at least 32 characters." });
    }
  }

  // ── Database ────────────────────────────────────────────────
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    issues.push({ variable: "DATABASE_URL", level: "error", message: "Missing. Supabase → Connect → Transaction pooler connection string (port 6543)." });
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(dbUrl);
    } catch {
      issues.push({ variable: "DATABASE_URL", level: "error", message: "Not a valid connection string. Paste it without quotes; if the password contains @ # / ? or %, URL-encode it." });
    }
    if (parsed) {
      const host = parsed.hostname.toLowerCase();
      if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
        issues.push({ variable: "DATABASE_URL", level: "error", message: "Must start with postgres:// or postgresql://." });
      } else if (onVercel && LOCAL_HOSTS.has(host)) {
        issues.push({ variable: "DATABASE_URL", level: "error", message: "Points to localhost — the built-in development database, which doesn't exist on Vercel. Use your Supabase connection string." });
      } else if (dbUrl.includes("[YOUR-PASSWORD]") || dbUrl.includes("<password>")) {
        issues.push({ variable: "DATABASE_URL", level: "error", message: "Still contains the password placeholder. Replace it with your database password." });
      } else if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) {
        issues.push({ variable: "DATABASE_URL", level: "warning", message: "This is Supabase's direct connection, which is IPv6-only and usually unreachable from Vercel. Use the Transaction pooler string (…pooler.supabase.com:6543)." });
      } else if (host.endsWith("pooler.supabase.com") && parsed.port === "5432") {
        issues.push({ variable: "DATABASE_URL", level: "warning", message: "This is the Session pooler (port 5432). On Vercel use the Transaction pooler (port 6543)." });
      }
    }
  }

  // ── Links in emails ─────────────────────────────────────────
  if (production && provider === "supabase" && !env.NEXT_PUBLIC_SITE_URL && !env.VERCEL_PROJECT_PRODUCTION_URL) {
    issues.push({ variable: "NEXT_PUBLIC_SITE_URL", level: "warning", message: "Not set: confirmation and password-reset emails need your site's public address." });
  }
  return issues;
}

export const blockingIssues = (issues: ConfigIssue[]) => issues.filter((i) => i.level === "error");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Plain HTML page shown instead of the app while required settings are missing. */
export function setupPageHtml(issues: ConfigIssue[]): string {
  const rows = issues
    .map((i) => `<li><code>${esc(i.variable)}</code><span class="lvl ${i.level}">${i.level === "error" ? "required" : "check"}</span><p>${esc(i.message)}</p></li>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DENTRACK · setup needed</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f3f6f7;--card:#fff;--ink:#0d1b2a;--muted:#5b6b7a;--line:#dde5ea;--teal:#0e9a92;--danger:#b4232c;--warn:#a5600b}
@media (prefers-color-scheme:dark){:root{--bg:#08121f;--card:#0f1d2e;--ink:#e8eef3;--muted:#93a4b5;--line:#1f3247;--teal:#2bb8ae;--danger:#f0717a;--warn:#e7a54a}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:48px max(16px,env(safe-area-inset-left))}
main{max-width:640px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}
h1{margin:0 0 6px;font-size:22px}p{margin:0;color:var(--muted)}ul{list-style:none;padding:0;margin:20px 0}
li{border-top:1px solid var(--line);padding:14px 0}code{font:600 13px ui-monospace,Menlo,Consolas,monospace}
.lvl{margin-left:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}.error{color:var(--danger)}.warning{color:var(--warn)}
li p{margin-top:4px}.foot{font-size:13px}a{color:var(--teal)}
</style></head><body><main>
<h1>DENTRACK needs a few settings</h1>
<p>The website is running, but these environment variables are missing or wrong. Add them in Vercel → Project → Settings → Environment Variables, then redeploy.</p>
<ul>${rows}</ul>
<p class="foot">Values are never shown here. After redeploying, <a href="/api/health">/api/health</a> checks the database connection too. See README → “Deploying to Vercel”.</p>
</main></body></html>`;
}
