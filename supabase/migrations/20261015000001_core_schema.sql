-- DENTRACK core schema
-- Monetary values use NUMERIC. Never float.
-- Every business table carries laboratory_id for Row Level Security isolation.

-- gen_random_uuid() is built into PostgreSQL 13+; pgcrypto is optional.
do $$ begin create extension if not exists pgcrypto; exception when others then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- Enumerations
-- ─────────────────────────────────────────────────────────────
create type public.member_role as enum ('admin', 'technician');
create type public.case_lifecycle as enum ('active', 'completed', 'delivered', 'cancelled');
create type public.case_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.cost_basis as enum ('actual', 'estimate');
create type public.labor_entry_type as enum ('hours', 'manual');
create type public.invoice_status as enum ('draft', 'issued', 'void');
create type public.other_cost_category as enum (
  'outsourcing', 'external_milling', 'external_scanning', 'external_3d_printing',
  'specialized_finishing', 'equipment_rental', 'logistics', 'packaging',
  'remake', 'additional_materials', 'external_services', 'other'
);
create type public.expense_category as enum (
  'rent', 'electricity', 'water', 'internet', 'equipment_maintenance',
  'admin_salaries', 'software', 'insurance', 'other'
);
create type public.expense_recurrence as enum ('one_time', 'monthly', 'quarterly', 'yearly');
create type public.stage_system_key as enum ('received', 'completed', 'delivered');

-- ─────────────────────────────────────────────────────────────
-- Shared trigger: updated_at
-- ─────────────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Laboratories, profiles, memberships
-- ─────────────────────────────────────────────────────────────
create table public.laboratories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  is_demo boolean not null default false,
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  date_format text not null default 'dd MMM yyyy',
  due_soon_days int not null default 2 check (due_soon_days between 0 and 30),
  contact_email text,
  phone text,
  address text,
  logo_url text,
  -- Accounting policy: revenue recognized when the case is delivered (accrual basis).
  revenue_recognition text not null default 'on_delivery' check (revenue_recognition in ('on_delivery')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger laboratories_updated before update on public.laboratories
  for each row execute function public.tg_set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  reduced_motion boolean not null default false,
  active_laboratory_id uuid references public.laboratories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create table public.laboratory_memberships (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'technician',
  -- Explicit grant allowing a non-admin to record case production costs.
  can_manage_costs boolean not null default false,
  is_active boolean not null default true,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (laboratory_id, user_id)
);
create index on public.laboratory_memberships (user_id);

create table public.lab_invitations (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null default 'technician',
  can_manage_costs boolean not null default false,
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index lab_invitations_pending_uq
  on public.lab_invitations (laboratory_id, lower(email)) where accepted_at is null;

-- ─────────────────────────────────────────────────────────────
-- Technicians (may or may not have a login account)
-- ─────────────────────────────────────────────────────────────
create table public.technicians (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  job_title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (laboratory_id, user_id)
);
create index on public.technicians (laboratory_id);

-- ─────────────────────────────────────────────────────────────
-- Trays: physical numbered trays. The engraved number is the only identifier.
-- ─────────────────────────────────────────────────────────────
create table public.trays (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  number int not null check (number between 1 and 9999),
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (laboratory_id, number)
);

-- ─────────────────────────────────────────────────────────────
-- Directory: clinics, dentists, patients
-- ─────────────────────────────────────────────────────────────
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (laboratory_id, name)
);

create table public.dentists (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create index on public.dentists (clinic_id);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete set null,
  reference text not null check (length(trim(reference)) between 1 and 60),
  -- Optional. Data minimization: a reference code is enough for most work.
  full_name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (laboratory_id, reference)
);
create index on public.patients (clinic_id);

-- ─────────────────────────────────────────────────────────────
-- Services and production stages
-- ─────────────────────────────────────────────────────────────
create table public.prosthetic_categories (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  position int not null default 0,
  is_active boolean not null default true,
  unique (laboratory_id, name)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  category_id uuid not null references public.prosthetic_categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  unit_label text not null default 'unit',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (laboratory_id, name)
);

-- Price list with history. Admin-only (pricing is sensitive). Never overwritten:
-- a new price is a new row with a later effective_from.
create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  effective_from date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (service_id, effective_from)
);

create table public.production_stages (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  position int not null,
  system_key public.stage_system_key,
  unique (laboratory_id, name),
  unique (laboratory_id, system_key)
);

-- ─────────────────────────────────────────────────────────────
-- Cases
-- ─────────────────────────────────────────────────────────────
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  reference text not null check (length(trim(reference)) between 1 and 40),
  patient_id uuid not null references public.patients(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  dentist_id uuid references public.dentists(id) on delete set null,
  category_id uuid not null references public.prosthetic_categories(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  technician_id uuid references public.technicians(id) on delete set null,
  stage_id uuid not null references public.production_stages(id) on delete restrict,
  lifecycle public.case_lifecycle not null default 'active',
  priority public.case_priority not null default 'normal',
  units int not null default 1 check (units between 1 and 64),
  tooth_numbers text,
  shade text,
  received_date date not null,
  due_date date not null,
  completed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  archived_at timestamptz,
  notes text,
  -- Cost-section completeness. No entries + not confirmed = missing data, never zero.
  materials_confirmed boolean not null default false,
  labor_confirmed boolean not null default false,
  other_costs_confirmed boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (laboratory_id, reference),
  check (due_date >= received_date),
  check (lifecycle <> 'delivered' or delivered_at is not null),
  check (lifecycle not in ('completed', 'delivered') or completed_at is not null),
  check (lifecycle <> 'cancelled' or cancelled_at is not null)
);
create index cases_lab_lifecycle_idx on public.cases (laboratory_id, lifecycle) where archived_at is null;
create index cases_due_idx on public.cases (laboratory_id, due_date);
create index cases_tech_idx on public.cases (technician_id);
create index cases_patient_idx on public.cases (patient_id);
create index cases_clinic_idx on public.cases (clinic_id);
create trigger cases_updated before update on public.cases
  for each row execute function public.tg_set_updated_at();

-- Pricing for a case — admin-only table so technicians never see prices via RLS.
create table public.case_financials (
  case_id uuid primary key references public.cases(id) on delete cascade,
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  selling_price numeric(12,2) check (selling_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  -- Planning estimate only. Never used as a recorded cost.
  estimated_direct_cost numeric(12,2) check (estimated_direct_cost >= 0),
  price_source text check (price_source in ('price_list', 'manual')),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (selling_price is null or discount_amount <= selling_price)
);

-- ─────────────────────────────────────────────────────────────
-- Tray assignments: history is preserved; one active row per tray and per case.
-- ─────────────────────────────────────────────────────────────
create table public.tray_assignments (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  tray_id uuid not null references public.trays(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  released_at timestamptz,
  released_by uuid,
  release_confirmed_empty boolean,
  release_reason text,
  check ((released_at is null) = (release_confirmed_empty is null)),
  check (released_at is null or release_confirmed_empty = true),
  check (released_at is null or released_at >= assigned_at)
);
create unique index tray_one_active_case on public.tray_assignments (tray_id) where released_at is null;
create unique index case_one_active_tray on public.tray_assignments (case_id) where released_at is null;
create index on public.tray_assignments (case_id);

create table public.case_status_history (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  from_stage_id uuid references public.production_stages(id),
  to_stage_id uuid not null references public.production_stages(id),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  note text
);
create index on public.case_status_history (case_id, changed_at);

create table public.case_notes (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  author_id uuid,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.case_notes (case_id, created_at);

create table public.case_attachments (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Direct cost records
-- ─────────────────────────────────────────────────────────────
create table public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  unit text not null check (length(trim(unit)) between 1 and 20),
  -- Optional: no default cost is assumed when the lab has not entered one.
  default_unit_cost numeric(12,4) check (default_unit_cost >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (laboratory_id, name)
);
create trigger material_catalog_updated before update on public.material_catalog
  for each row execute function public.tg_set_updated_at();

create table public.case_material_costs (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  material_id uuid references public.material_catalog(id) on delete set null,
  -- Snapshot of name/unit/cost at recording time; later catalog edits never change this row.
  material_name text not null,
  unit text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  basis public.cost_basis not null default 'actual',
  recorded_on date not null default current_date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.case_material_costs (case_id);

create table public.labor_rates (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  -- null technician = laboratory default rate
  technician_id uuid references public.technicians(id) on delete cascade,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  effective_from date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index labor_rates_uq on public.labor_rates
  (laboratory_id, coalesce(technician_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);

create table public.case_labor_entries (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  technician_id uuid references public.technicians(id) on delete set null,
  technician_name text not null,
  task text not null check (length(trim(task)) between 1 and 200),
  entry_type public.labor_entry_type not null,
  hours numeric(6,2) check (hours > 0 and hours <= 200),
  hourly_rate numeric(10,2) check (hourly_rate >= 0),
  manual_amount numeric(12,2) check (manual_amount >= 0),
  amount numeric(12,2) generated always as (
    case when entry_type = 'hours' then round(hours * hourly_rate, 2) else manual_amount end
  ) stored,
  basis public.cost_basis not null default 'actual',
  work_date date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (
    (entry_type = 'hours' and hours is not null and hourly_rate is not null and manual_amount is null)
    or (entry_type = 'manual' and manual_amount is not null and hours is null and hourly_rate is null)
  )
);
create index on public.case_labor_entries (case_id);

create table public.case_other_direct_costs (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  category public.other_cost_category not null,
  description text not null check (length(trim(description)) between 1 and 200),
  amount numeric(12,2) not null check (amount >= 0),
  cost_date date not null default current_date,
  supplier text,
  notes text,
  basis public.cost_basis not null default 'actual',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.case_other_direct_costs (case_id);

-- ─────────────────────────────────────────────────────────────
-- Operating expenses (never allocated to cases automatically)
-- ─────────────────────────────────────────────────────────────
create table public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  category public.expense_category not null,
  description text not null check (length(trim(description)) between 1 and 200),
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null,
  recurrence public.expense_recurrence not null default 'one_time',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.operating_expenses (laboratory_id, expense_date);

-- ─────────────────────────────────────────────────────────────
-- Invoicing, payments, credits
-- ─────────────────────────────────────────────────────────────
create table public.lab_counters (
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  key text not null,
  value int not null default 0,
  primary key (laboratory_id, key)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  number text not null,
  status public.invoice_status not null default 'draft',
  issue_date date,
  due_date date,
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (laboratory_id, number),
  check (status = 'draft' or issue_date is not null),
  check (status <> 'void' or voided_at is not null),
  check (due_date is null or issue_date is null or due_date >= issue_date)
);
create index on public.invoices (laboratory_id, issue_date);
create index on public.invoices (clinic_id);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  case_id uuid references public.cases(id) on delete restrict,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  voided boolean not null default false
);
-- A case can be billed on only one non-void invoice line (prevents double billing).
create unique index invoice_lines_case_once on public.invoice_lines (case_id)
  where case_id is not null and not voided;
create index on public.invoice_lines (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'cash', 'card', 'cheque', 'other')),
  reference text,
  -- Client-generated per submission. A retried submit can never create a second payment.
  idempotency_key uuid not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (laboratory_id, idempotency_key)
);
create index on public.payments (laboratory_id, payment_date);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  unique (payment_id, invoice_id)
);
create index on public.payment_allocations (invoice_id);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 2 and 300),
  issue_date date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Audit, activity, notifications
-- ─────────────────────────────────────────────────────────────
create table public.financial_audit_log (
  id bigint generated always as identity primary key,
  laboratory_id uuid not null,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index on public.financial_audit_log (laboratory_id, changed_at desc);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  actor_id uuid,
  case_id uuid references public.cases(id) on delete cascade,
  tray_id uuid references public.trays(id) on delete set null,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity_logs (laboratory_id, created_at desc);
create index on public.activity_logs (case_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'due_soon', 'overdue', 'assignment', 'status_change', 'case_completed', 'tray_reassigned', 'system'
  )),
  title text not null,
  body text,
  link text,
  case_id uuid references public.cases(id) on delete cascade,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index on public.notifications (user_id, created_at desc);
