# DENTRACK

Dental laboratory management built around the physical, numbered tray. Place a case in tray #014, follow it through production, record what it really cost to make, bill the clinic, and release the tray only when someone confirms it is physically empty.

No QR codes, NFC or sensors: the engraved tray number is the only identifier.

## Quick start (no setup needed)

You only need **Node.js 20 or newer**. No database to install.

1. Unzip the folder somewhere easy, e.g. `Documents/dentrack`.
2. Open **VS Code** → **File → Open Folder…** → choose the `dentrack` folder.
3. Open the terminal inside VS Code: **Terminal → New Terminal**.
4. Type `npm install` and press Enter (first time only, takes a minute or two).
5. Type `npm run dev` and press Enter. Wait until you see **✓ Database ready** and **Ready**.
6. Open **http://localhost:3000** in your browser and sign in:
   - Owner (sees everything): `owner@demo.dentrack.test` / `demo-password`
   - Technician: `tech@demo.dentrack.test` / `demo-password`

To stop it, click in the terminal and press **Ctrl + C**. Next time you only need step 5.
Your data is kept in the `.dentrack-data` folder; `npm run reset-demo` wipes it and starts fresh.

There is no `.html` file to open — it's a web app, so `npm run dev` starts a small server on your computer and you use it in the browser at the address above.

**Language and theme:** the **EN | SQ** switch in the top bar changes the whole app between English and Albanian (Shqip), and the **☀ / ☾** switch changes light and dark mode. Both are remembered.

## What's inside

| Area | What it does |
| --- | --- |
| **Tray board** | Every tray drawn as a two-compartment steel tray (UPPER / LOWER, engraved number). Search by number, case or patient; filter by status, technician and due date; grid or list; sort by number or urgency. Place, move and release cases; add, label and deactivate trays; per-tray history. |
| **Cases** | Create, edit, reassign, cancel, archive and restore. Tabs: Overview, Production workflow (animated, time-stamped stages), Cost breakdown, Pricing & invoicing, Notes & files, Activity history. |
| **Cost breakdown** | Materials (quantity × unit cost, fractional quantities, catalog snapshot), labor (hours × configured hourly cost, or a manual amount), other direct costs. Each section is *Not recorded → In progress → Confirmed* so missing data is never treated as zero. Donut + bar distribution. |
| **Finance** | Invoices (draft/issued/void), partial payments with allocation, unapplied payments, credit notes, idempotent payment recording, operating expenses. |
| **Analytics** | Production (occupancy, average production time, completion and on-time rates, workload) and financial (billed sales, recognized revenue, payments, receivables, direct costs, gross profit/contribution, operating profit when calculable), with period/category/clinic/technician filters. |
| **Directory** | Clinics with dentists, invoices and balances; patients with minimal data and case history. |
| **Team** | Technicians (with or without login), invitations, roles, explicit cost-recording permission. Workload counts only; no scores or rankings. |
| **Everything else** | Dashboard, notifications (deadline, assignment, stage, completion, tray moves; per-type preferences), Ctrl/⌘ K command palette, light/dark/system theme, English and Albanian (Shqip), reduced motion, demo workspace. |

## Architecture

- **Next.js 16** (App Router, React 19, TypeScript), **Tailwind CSS 4**, Radix primitives, Motion, Recharts, cmdk, React Hook Form + Zod.
- **PostgreSQL** (Supabase in production). The server connects with `DATABASE_URL` and, for every request, runs inside a transaction as the `authenticated` role with the user's JWT claims set — exactly what Supabase's API does — so **Row Level Security enforces every permission**. Hiding UI is never the only protection.
- All multi-row rules live in the database as transactional `SECURITY DEFINER` functions with explicit permission checks: `assign_tray`, `release_tray`, `move_case_to_tray`, `create_case`, `move_case_stage`, `add_material_cost`, `add_labor_entry`, `create_invoice`, `record_payment`, `add_credit_note`, analytics, etc.
- **Auth:** Supabase Auth in production (`AUTH_PROVIDER=supabase`). A local email/password mode (`AUTH_PROVIDER=local`, bcrypt + signed httpOnly cookie) exists for development and CI against plain PostgreSQL; it is refused in production unless `ALLOW_LOCAL_AUTH=true`.

```
src/app/(auth)        login, signup, password reset
src/app/(app)         the signed-in application (dashboard, trays, cases, …)
src/components        UI (tray visual & board, case tabs, finance, settings, shell)
src/lib/data          server-only queries (run with RLS)
src/lib/actions       server actions (validated with Zod, run with RLS)
src/lib/finance.ts    decimal-safe financial calculations (decimal.js)
supabase/migrations   schema, RLS, workflow functions, analytics, demo generator
supabase/local        auth shim that lets the same migrations run on plain PostgreSQL
tests/unit|db|e2e     Vitest, SQL integration tests, Playwright
```

### Data integrity rules (enforced in PostgreSQL)

- One active case per tray and one active tray per case: partial unique indexes on `tray_assignments` plus row locks; a concurrent-assignment test proves exactly one winner.
- Completing a case never releases its tray. `release_tray` requires `confirm_empty = true` (and a reason if the case is still in production). Assignment history is kept forever.
- Money is `NUMERIC` everywhere; analytics return money as exact decimal strings; the UI calculates with `decimal.js`. Amounts round half-up to 2 decimals, percentages to 1.
- Prices and costs are snapshotted: a case stores its selling price; a material line stores name, unit and unit cost; price lists and labor rates are effective-dated rows that are never overwritten.
- A case can be on only one non-void invoice; invoiced prices are locked (use a credit note). Payments, allocations and credit notes are immutable; payments are idempotent per submission key; allocations can't exceed the payment or the invoice balance.
- Every change to financial tables is written to `financial_audit_log` (before/after, who, when).
- Laboratory isolation on every table via RLS. Technicians cannot read prices, invoices, payments, labor rates or cost records (unless granted cost recording), and only see patients of cases assigned to them.

### Accounting policy

- **Billed sales** = issued invoice lines, by issue date. **Payments received** = cash by payment date. They are never mixed.
- **Recognized revenue** (accrual) = net selling price of cases **delivered** in the period.
- **Direct cost** = materials + labor + other direct costs recorded on the case. Overheads are never allocated to cases.
- **Gross profit** = recognized revenue − direct cost of those delivered cases. When any of those cases has an unconfirmed section or estimates, the figure is labelled **Contribution after recorded costs** and flagged as possibly overstated.
- **Operating profit** = gross profit − operating expenses in the same period; shown only for the whole laboratory (not when filtering by category, clinic or technician) and never presented as net profit.
- Profitability rankings by margin or profit use only cases with complete cost records and need at least 3 of them.

## Setup

Requirements: Node 20+ (22 recommended) and a PostgreSQL 15+ database (Supabase project for production).

### 1. Supabase (production)

1. Create a Supabase project.
2. Apply the migrations in order (`supabase/migrations/*.sql`):
   - with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or
   - paste each file into the SQL editor in filename order.
   **Do not** run `supabase/local/auth_shim.sql` on Supabase.
3. Authentication → URL configuration: set the Site URL to your deployment URL and add `https://<your-domain>/auth/callback` to the redirect URLs.
4. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (transaction pooler), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. Optionally `SUPABASE_SERVICE_ROLE_KEY` to email invitations (server-only).
5. `npm install && npm run dev`, create an account, then create your laboratory (or open the demo).

### 2. Local development against your own PostgreSQL

`npm run dev` uses the built-in database unless `DATABASE_URL` is set (in the environment or `.env.local`). To use your own PostgreSQL instead:

```bash
cp .env.example .env.local
# set: DATABASE_URL=postgres://postgres@127.0.0.1:5432/dentrack
#      AUTH_PROVIDER=local  SESSION_SECRET=<32+ random chars>  ALLOW_LOCAL_AUTH=true
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres   # used by the scripts below
npm install
npm run db:reset     # creates "dentrack": auth shim + all migrations
npm run db:seed      # demo laboratory + two accounts
npm run dev
```

Demo accounts (local only): `owner@demo.dentrack.test` (administrator) and `tech@demo.dentrack.test` (technician), password `demo-password`. In local mode, password-reset links are printed to the server log.

## Translations

English text is the key; Albanian lives in `src/lib/i18n/sq.ts` (`SQ` for UI strings, `SQ_PATTERNS` for messages generated by the database such as errors, activity history and notifications). Strings without a translation fall back to English. Run `npm run check:i18n` to list any `t("…")` string that has no Albanian entry. Albanian numbers and money are formatted without relying on the browser's locale data (`12 345,60 €`), so server and browser always agree.

## Demo data

The demo is a **separate laboratory** flagged `is_demo`, created by `create_demo_laboratory()` — from the onboarding screen ("Open demo"), the account menu ("Add or try a laboratory"), or `npm run db:seed` locally. It contains fictional clinics, patients, technicians, 24 trays, ~60 cases across four months, material/labor/other costs, invoices, partial payments and operating expenses. Demo prices, unit costs and hourly rates are illustrative values used only inside that laboratory; a banner marks every demo screen. Real laboratories start empty: no prices, wages or costs are invented.

## Testing

| Command | What it covers | Needs |
| --- | --- | --- |
| `npm test` | Vitest unit tests: cost lines, totals, the 44.50 / 37.1 / 44.9 / 18.0 % example, missing-vs-zero, contribution vs gross profit, zero denominators, partial payments, pro-rata attribution, reporting periods. | — |
| `npm run test:db` | ~80 SQL assertions on a throwaway database: tray conflicts, completion ≠ release, release confirmation, moves, RLS isolation between labs, technician restrictions, cost totals, catalog snapshots, labor rate history, invoicing, duplicate billing, idempotent payments, over-allocation, credit notes, immutability, analytics (billed vs recognized vs paid, gross & operating profit, filters, periods), archive counting, notifications; plus a two-session race test. | `psql` + PG env vars |
| `npm run test:e2e` | Playwright: login/validation/logout, protected routes, full tray lifecycle, cost breakdown in the browser, technician permissions, command palette, theme persistence, mobile drawer, notifications, keyboard order. | seeded DB, running app |
| `npm run typecheck`, `npm run lint` | TypeScript and ESLint. | — |

CI (`.github/workflows/ci.yml`) runs all of these against PostgreSQL 16 and a production build.

## Deploying to Vercel

Vercel runs the website; Supabase provides the database and login. Both have free plans.

**1. Supabase (database + login)**
1. Create a project at supabase.com. Save the database password you choose.
2. Apply the migrations: SQL Editor → paste each file from `supabase/migrations/` in filename order (0001 → 0007) and run it. Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`. **Do not** run `supabase/local/auth_shim.sql` (it is only for the built-in local database).
3. Note these values:
   - Project Settings → Database → Connection string → **Transaction pooler** (port 6543) → `DATABASE_URL`
   - Project Settings → API → Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Project Settings → API → `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (optional) `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`, only to email team invitations. Keep it secret.

**2. Vercel (website)**
1. Import the GitHub repository in Vercel. Framework: Next.js. Build command and output: leave the defaults.
2. Add these environment variables (Production and Preview):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL (port 6543) |
| `DATABASE_POOL_SIZE` | `5` |
| `AUTH_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
| `NEXT_PUBLIC_SITE_URL` | your Vercel address, e.g. `https://dentrack.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | optional (invitation emails) |

   Do **not** set `SESSION_SECRET`, `ALLOW_LOCAL_AUTH` or `AUTH_PROVIDER=local` on Vercel; those are for local use.
3. Deploy. Then in Supabase → Authentication → URL Configuration, set the Site URL to your Vercel address and add `https://<your-vercel-domain>/auth/callback` to the redirect URLs.
4. Open the site, create an account, confirm the email, then create your laboratory or choose **Explore with demo data first**.

The demo accounts (`owner@demo.dentrack.test`) exist only in the built-in local database, not on Supabase.

**If the live site shows an error**
- A page titled **“DENTRACK needs a few settings”** lists the environment variables that are missing or wrong (names only, never values). Fix them in Vercel, then **redeploy**: Vercel only applies changed variables to new deployments.
- Open **`/api/health`** on your site. It checks the settings, the database connection, whether all migrations were applied, the Row Level Security role, and whether Supabase accepts the anon key, and says what to fix. It shows no secrets.
- Still a 500? Vercel → Project → Logs (or Deployments → the deployment → Functions) shows the server error message.

The app has no other services: files attached to cases are stored in PostgreSQL (≤ 10 MB each) under the same RLS.

## Known limits

- Invoices are printable pages (browser print to PDF); there is no PDF generator or e-invoicing integration.
- Overhead allocation to cases is intentionally not implemented; it would need an explicit, configurable method.
- The local auth mode is for development and CI. Use Supabase Auth in production.
