"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "@/lib/env";
import { asSystem } from "@/lib/db";
import { createLocalSession, LOCAL_SESSION_COOKIE, supabaseServer, getSessionUser } from "@/lib/auth/session";
import { fromZod, type ActionResult } from "@/lib/actions/result";

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export async function signIn(input: { email: string; password: string; remember: boolean; next?: string }): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password"), remember: z.boolean() }).safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { email: e, password: p, remember } = parsed.data;

  if (env.authProvider === "local") {
    const user = await asSystem(async (sql) => {
      const [u] = await sql<{ id: string; email: string; encrypted_password: string | null }[]>`
        select id, email, encrypted_password from auth.users where lower(email) = ${e}`;
      return u;
    });
    // Constant-ish time: always run a bcrypt compare.
    const ok = await bcrypt.compare(p, user?.encrypted_password ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    if (!user || !ok) return { ok: false, error: "Email or password is incorrect." };
    await createLocalSession({ id: user.id, email: user.email }, remember);
  } else {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    if (error) {
      return { ok: false, error: error.message === "Email not confirmed"
        ? "Confirm your email address first — check your inbox for the link."
        : "Email or password is incorrect." };
    }
  }
  redirect(safeNext(input.next));
}

export async function signUp(input: { fullName: string; email: string; password: string }): Promise<ActionResult> {
  const parsed = z
    .object({ fullName: z.string().trim().min(2, "Enter your name").max(120), email, password })
    .safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const { fullName, email: e, password: p } = parsed.data;

  if (env.authProvider === "local") {
    const hash = await bcrypt.hash(p, 10);
    try {
      const id = await asSystem(async (sql) => {
        const [u] = await sql<{ id: string }[]>`
          insert into auth.users (email, encrypted_password, raw_user_meta_data)
          values (${e}, ${hash}, ${sql.json({ full_name: fullName })}) returning id`;
        return u.id;
      });
      await createLocalSession({ id, email: e }, true);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return { ok: false, error: "An account with this email already exists.", fieldErrors: { email: "Already registered" } };
      throw err;
    }
    redirect("/dashboard");
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: e,
    password: p,
    options: { data: { full_name: fullName }, emailRedirectTo: `${env.siteUrl}/auth/callback?next=/dashboard` },
  });
  if (error) return { ok: false, error: error.message };
  if (!data.session) return { ok: true, message: "Check your email to confirm your account, then sign in." };
  redirect("/dashboard");
}

export async function signOut() {
  if (env.authProvider === "local") {
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
  } else {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

const GENERIC_RESET = "If an account exists for that email, a reset link is on its way.";

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = z.object({ email }).safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  if (env.authProvider === "local") {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const created = await asSystem(async (sql) => {
      const r = await sql`
        insert into auth.local_reset_tokens (token_hash, user_id, expires_at)
        select ${hash}, id, now() + interval '30 minutes' from auth.users where lower(email) = ${parsed.data.email}`;
      return r.count > 0;
    });
    if (created) {
      // Local mode has no mail server: the link is written to the server log.
      console.info(`[dentrack] Password reset link for ${parsed.data.email}: ${env.siteUrl}/reset-password?token=${token}`);
    }
    return { ok: true, message: GENERIC_RESET };
  }

  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password`,
  });
  return { ok: true, message: GENERIC_RESET };
}

export async function resetPassword(input: { password: string; confirm: string; token?: string }): Promise<ActionResult> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
    .safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  if (env.authProvider === "local") {
    if (!input.token) return { ok: false, error: "This reset link is invalid. Request a new one." };
    const hash = createHash("sha256").update(input.token).digest("hex");
    const pw = await bcrypt.hash(parsed.data.password, 10);
    const ok = await asSystem((sql) =>
      sql.begin(async (tx) => {
        const [t] = await tx<{ user_id: string }[]>`
          update auth.local_reset_tokens set used_at = now()
          where token_hash = ${hash} and used_at is null and expires_at > now() returning user_id`;
        if (!t) return false;
        await tx`update auth.users set encrypted_password = ${pw} where id = ${t.user_id}`;
        return true;
      }),
    );
    if (!ok) return { ok: false, error: "This reset link has expired or was already used. Request a new one." };
    return { ok: true, message: "Password updated. You can sign in now." };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Your reset link has expired. Request a new one." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Password updated." };
}
