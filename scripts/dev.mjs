// `npm run dev` — starts DENTRACK with zero setup.
//
// • If DATABASE_URL is set (in .env.local or the environment), Next.js starts against that database.
// • Otherwise an embedded PostgreSQL (PGlite) is started, stored in the ./.dentrack-data folder.
//   On first run it applies every migration and loads the demo laboratory, so you can sign in
//   straight away with owner@demo.dentrack.test / demo-password.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

function readEnvFile() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function runNext(env) {
  const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, ...env }, cwd: root });
  child.on("exit", (code) => process.exit(code ?? 0));
  return child;
}

const freePort = (start) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(freePort(start + 1)));
    s.listen(start, "127.0.0.1", () => s.close(() => resolve(start)));
  });

const fileEnv = readEnvFile();
if (process.env.DATABASE_URL || fileEnv.DATABASE_URL) {
  runNext({});
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const dataDir = path.join(root, ".dentrack-data");
  fs.mkdirSync(dataDir, { recursive: true });

  console.log("\n  DENTRACK · starting the built-in database (first start takes ~20 seconds)…");
  const db = await PGlite.create({ dataDir: path.join(dataDir, "pg") });

  // Apply the auth shim once, then any migrations not applied yet.
  await db.exec(`create schema if not exists dentrack_meta;
                 create table if not exists dentrack_meta.migrations (name text primary key, applied_at timestamptz default now());`);
  const applied = new Set((await db.query("select name from dentrack_meta.migrations")).rows.map((r) => r.name));
  const files = [
    ["000_local_auth_shim.sql", path.join(root, "supabase/local/auth_shim.sql")],
    ...fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
      .map((f) => [f, path.join(root, "supabase/migrations", f)]),
  ];
  let fresh = applied.size === 0;
  for (const [name, file] of files) {
    if (applied.has(name)) continue;
    process.stdout.write(`  · applying ${name}\n`);
    await db.transaction(async (tx) => {
      await tx.exec(fs.readFileSync(file, "utf8"));
      await tx.query("insert into dentrack_meta.migrations (name) values ($1)", [name]);
    });
  }

  const secretFile = path.join(dataDir, "session-secret");
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString("hex"));
  const port = await freePort(5544);
  // Queries are serialised over one connection (PGlite is single-user); fine for local use.
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  const url = `postgres://postgres@127.0.0.1:${port}/postgres`;

  if (fresh) {
    const { default: postgres } = await import("postgres");
    const { seedDemo } = await import("./seed-local.mjs");
    const sql = postgres(url, { max: 1, prepare: false });
    process.stdout.write("  · loading demo data\n");
    await seedDemo(sql);
    await sql.end();
  }

  console.log("\n  ✓ Database ready. Sign in with  owner@demo.dentrack.test  /  demo-password");
  console.log("    (technician account: tech@demo.dentrack.test / demo-password)\n");

  const child = runNext({
    DATABASE_URL: url,
    DATABASE_POOL_SIZE: "1",
    AUTH_PROVIDER: "local",
    SESSION_SECRET: fileEnv.SESSION_SECRET || fs.readFileSync(secretFile, "utf8"),
    NEXT_PUBLIC_SITE_URL: fileEnv.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  });
  const shutdown = async () => {
    child.kill("SIGINT");
    try { await server.stop(); await db.close(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
