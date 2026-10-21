import { describe, expect, it } from "vitest";
import { blockingIssues, checkConfig, setupPageHtml } from "@/lib/config-check";

const good = {
  NODE_ENV: "production",
  VERCEL: "1",
  DATABASE_URL: "postgres://postgres.abcdefghijklmnop:s3cret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_SITE_URL: "https://dentrack.example",
};
const vars = (env: Record<string, string | undefined>) => checkConfig(env).map((i) => `${i.level}:${i.variable}`);

describe("checkConfig", () => {
  it("accepts a correct Vercel + Supabase setup", () => {
    expect(checkConfig(good)).toEqual([]);
  });

  it("reports every missing required variable when nothing is set", () => {
    expect(vars({ NODE_ENV: "production", VERCEL: "1" })).toEqual([
      "error:NEXT_PUBLIC_SUPABASE_URL",
      "error:NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "error:DATABASE_URL",
      "warning:NEXT_PUBLIC_SITE_URL",
    ]);
  });

  it("rejects the local development database on Vercel", () => {
    expect(vars({ ...good, DATABASE_URL: "postgres://postgres@127.0.0.1:5544/postgres" })).toEqual(["error:DATABASE_URL"]);
  });

  it("rejects local auth in production unless deliberately allowed", () => {
    expect(vars({ ...good, AUTH_PROVIDER: "local", SESSION_SECRET: "x".repeat(40) })).toEqual(["error:AUTH_PROVIDER"]);
    expect(vars({ ...good, AUTH_PROVIDER: "local", ALLOW_LOCAL_AUTH: "true", SESSION_SECRET: "x".repeat(40) })).toEqual([]);
  });

  it("flags placeholders and malformed values", () => {
    expect(vars({ ...good, DATABASE_URL: "postgresql://postgres:[YOUR-PASSWORD]@x.pooler.supabase.com:6543/postgres" })).toEqual(["error:DATABASE_URL"]);
    expect(vars({ ...good, DATABASE_URL: "not a url" })).toEqual(["error:DATABASE_URL"]);
    expect(vars({ ...good, NEXT_PUBLIC_SUPABASE_URL: "abcdefghijklmnop.supabase.co" })).toEqual(["error:NEXT_PUBLIC_SUPABASE_URL"]);
  });

  it("warns about Supabase connection strings that don't work from Vercel", () => {
    expect(vars({ ...good, DATABASE_URL: "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres" })).toEqual(["warning:DATABASE_URL"]);
    expect(vars({ ...good, DATABASE_URL: "postgres://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" })).toEqual(["warning:DATABASE_URL"]);
    expect(blockingIssues(checkConfig({ ...good, DATABASE_URL: "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres" }))).toEqual([]);
  });

  it("never puts values on the setup page", () => {
    const html = setupPageHtml(checkConfig({ ...good, DATABASE_URL: "postgres://postgres:SECRET-PW@127.0.0.1:5544/postgres" }));
    expect(html).toContain("DATABASE_URL");
    expect(html).not.toContain("SECRET-PW");
    expect(html).not.toContain("127.0.0.1");
  });
});
