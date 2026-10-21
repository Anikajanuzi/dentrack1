-- ─────────────────────────────────────────────────────────────
-- 0008 · Guided tour progress and "Getting started" checklist
--
-- One row per user per laboratory. Adds a new table only: no existing table, row,
-- policy or function is changed. Safe to run on a database that already has data.
-- Re-running it is harmless (every statement is idempotent).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tutorial_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'skipped', 'completed')),
  step smallint not null default 0 check (step between 0 and 50),
  checklist_dismissed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, laboratory_id)
);

alter table public.tutorial_progress enable row level security;

-- Each person sees and changes only their own progress, and only for laboratories they belong to.
drop policy if exists tutorial_select on public.tutorial_progress;
create policy tutorial_select on public.tutorial_progress for select to authenticated
  using (user_id = auth.uid() and is_lab_member(laboratory_id));

drop policy if exists tutorial_insert on public.tutorial_progress;
create policy tutorial_insert on public.tutorial_progress for insert to authenticated
  with check (user_id = auth.uid() and is_lab_member(laboratory_id));

drop policy if exists tutorial_update on public.tutorial_progress;
create policy tutorial_update on public.tutorial_progress for update to authenticated
  using (user_id = auth.uid() and is_lab_member(laboratory_id))
  with check (user_id = auth.uid() and is_lab_member(laboratory_id));

revoke all on public.tutorial_progress from anon;
grant select, insert, update on public.tutorial_progress to authenticated;
