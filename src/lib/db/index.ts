import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { env } from "@/lib/env";

/**
 * Database access.
 *
 * The app connects with a server-only DATABASE_URL (Supabase: the pooled connection string).
 * Every request runs inside a transaction that switches to the `authenticated` role and sets the
 * same JWT claims Supabase's API would set, so Row Level Security and auth.uid() apply exactly as
 * they do for supabase-js. Privileged credentials never reach the browser.
 */
declare global {
  var __dentrackSql: Sql | undefined;
}

function client(): Sql {
  if (!globalThis.__dentrackSql) {
    globalThis.__dentrackSql = postgres(env.databaseUrl, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      prepare: false, // required for Supabase's transaction-mode pooler
      idle_timeout: 20,
      connect_timeout: 10,
      types: {
        // Return DATE as 'YYYY-MM-DD' strings (no timezone shifting); NUMERIC stays a string.
        date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      },
    });
  }
  return globalThis.__dentrackSql;
}

export type Tx = TransactionSql;

/** Run queries as the given user, with RLS enforced. */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await client().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  });
  return result as T;
}

/**
 * Privileged access for authentication plumbing only (local auth user lookup / creation).
 * Never use this for application data.
 */
export async function asSystem<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return fn(client());
}

/** Turn a database exception into a message safe to show to users. */
export function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint_name?: string };
  // Messages raised by DENTRACK's own functions (P0001/P0002/42501/28000/23505 with our text) are written for users.
  if (err?.code && ["P0001", "P0002", "42501", "28000"].includes(err.code) && err.message) return err.message;
  if (err?.code === "23505") {
    if (err.message?.match(/^(Tray|Case|This|Invoice)/)) return err.message;
    return "That record already exists.";
  }
  if (err?.code === "23503") return "This record is linked to other data and can't be changed that way.";
  if (err?.code === "23514") return "A value is outside its allowed range.";
  if (err?.code === "22P02" || err?.code === "22007" || err?.code === "22008") return "One of the values has an invalid format.";
  if (err?.code === "22003") return "A number is too large.";
  console.error("[db]", e);
  return "Something went wrong while saving. Please try again.";
}
