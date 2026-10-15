// Demo seed for local / embedded databases (AUTH_PROVIDER=local only).
// Creates two sign-in accounts and a DEMO laboratory filled with fictional data:
//   owner@demo.dentrack.test / demo-password   (administrator)
//   tech@demo.dentrack.test  / demo-password   (technician, no financial access)
// Usage: node --env-file=.env.local scripts/seed-local.mjs
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";

export async function seedDemo(sql) {
  const hash = await bcrypt.hash("demo-password", 10);
  const [owner] = await sql`
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values ('owner@demo.dentrack.test', ${hash}, ${sql.json({ full_name: "Dana Owner" })})
    on conflict (email) do update set encrypted_password = excluded.encrypted_password
    returning id`;
  const existing = await sql`select l.id from laboratories l join laboratory_memberships m on m.laboratory_id = l.id
                             where m.user_id = ${owner.id} and l.is_demo`;
  let lab = existing[0]?.id;
  if (!lab) {
    lab = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner.id, role: "authenticated" })}, true)`;
      await tx.unsafe("set local role authenticated");
      const [r] = await tx`select create_demo_laboratory() as id`;
      // Invite the technician account and link it to the existing demo technician "Marco Rossi".
      const [t] = await tx`select id from technicians where laboratory_id = ${r.id} and full_name = 'Marco Rossi'`;
      await tx`insert into lab_invitations (laboratory_id, email, role, technician_id, invited_by)
               values (${r.id}, 'tech@demo.dentrack.test', 'technician', ${t.id}, ${owner.id})`;
      return r.id;
    });
  }
  await sql`
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values ('tech@demo.dentrack.test', ${hash}, ${sql.json({ full_name: "Marco Rossi" })})
    on conflict (email) do nothing`;
  return lab;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const lab = await seedDemo(sql);
    console.log(`✓ Demo laboratory ${lab}`);
    console.log("  Admin:      owner@demo.dentrack.test / demo-password");
    console.log("  Technician: tech@demo.dentrack.test  / demo-password");
  } finally {
    await sql.end();
  }
}
