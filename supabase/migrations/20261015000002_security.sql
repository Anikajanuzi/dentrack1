-- DENTRACK security: permission helpers, Row Level Security, audit trail, derived views.

alter table public.lab_invitations add column technician_id uuid references public.technicians(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- Permission helpers (SECURITY DEFINER so policies don't recurse through RLS)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_lab_member(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from laboratory_memberships m
    where m.laboratory_id = p_lab and m.user_id = auth.uid() and m.is_active
  )
$$;

create or replace function public.is_lab_admin(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from laboratory_memberships m
    where m.laboratory_id = p_lab and m.user_id = auth.uid() and m.is_active and m.role = 'admin'
  )
$$;

create or replace function public.can_manage_costs(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from laboratory_memberships m
    where m.laboratory_id = p_lab and m.user_id = auth.uid() and m.is_active
      and (m.role = 'admin' or m.can_manage_costs)
  )
$$;

create or replace function public.my_technician_id(p_lab uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select t.id from technicians t where t.laboratory_id = p_lab and t.user_id = auth.uid() limit 1
$$;

create or replace function public.is_case_assignee(p_case uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c join technicians t on t.id = c.technician_id
    where c.id = p_case and t.user_id = auth.uid()
  )
$$;

-- Patients are visible to admins, and to technicians only for cases assigned to them.
create or replace function public.can_see_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients p
    where p.id = p_patient and (
      is_lab_admin(p.laboratory_id)
      or exists (
        select 1 from cases c join technicians t on t.id = c.technician_id
        where c.patient_id = p.id and t.user_id = auth.uid()
      )
    )
  )
$$;

-- Raise helpers used by workflow functions.
create or replace function public.assert_member(p_lab uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not is_lab_member(p_lab) then raise exception 'Not a member of this laboratory' using errcode = '42501'; end if;
end $$;

create or replace function public.assert_admin(p_lab uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not is_lab_admin(p_lab) then raise exception 'Administrator permission required' using errcode = '42501'; end if;
end $$;

create or replace function public.assert_cost_manager(p_lab uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not can_manage_costs(p_lab) then raise exception 'Cost recording permission required' using errcode = '42501'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Enable RLS everywhere
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'laboratories','profiles','laboratory_memberships','lab_invitations','technicians','trays',
    'clinics','dentists','patients','prosthetic_categories','services','service_prices',
    'production_stages','cases','case_financials','tray_assignments','case_status_history',
    'case_notes','case_attachments','material_catalog','case_material_costs','labor_rates',
    'case_labor_entries','case_other_direct_costs','operating_expenses','lab_counters','invoices',
    'invoice_lines','payments','payment_allocations','credit_notes','financial_audit_log',
    'activity_logs','notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Laboratories
create policy lab_select on public.laboratories for select to authenticated using (is_lab_member(id));
create policy lab_update on public.laboratories for update to authenticated using (is_lab_admin(id)) with check (is_lab_admin(id));

-- Profiles: self, plus co-members (names for assignment lists)
create policy profile_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from laboratory_memberships a join laboratory_memberships b on a.laboratory_id = b.laboratory_id
    where a.user_id = auth.uid() and a.is_active and b.user_id = profiles.id
  )
);
create policy profile_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships
create policy mem_select on public.laboratory_memberships for select to authenticated
  using (user_id = auth.uid() or is_lab_member(laboratory_id));
create policy mem_admin_update on public.laboratory_memberships for update to authenticated
  using (is_lab_admin(laboratory_id)) with check (is_lab_admin(laboratory_id));
create policy mem_self_prefs on public.laboratory_memberships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Users may only change their own notification_prefs; role/permission changes are admin-only.
create or replace function public.tg_membership_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_lab_admin(old.laboratory_id) then
    if new.role is distinct from old.role or new.can_manage_costs is distinct from old.can_manage_costs
       or new.is_active is distinct from old.is_active or new.user_id is distinct from old.user_id
       or new.laboratory_id is distinct from old.laboratory_id then
      raise exception 'Only administrators can change roles or permissions' using errcode = '42501';
    end if;
  end if;
  -- Never leave a laboratory without an active administrator.
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    if not exists (select 1 from laboratory_memberships m where m.laboratory_id = old.laboratory_id
                   and m.id <> old.id and m.role = 'admin' and m.is_active) then
      raise exception 'A laboratory must keep at least one active administrator';
    end if;
  end if;
  return new;
end $$;
create trigger membership_guard before update on public.laboratory_memberships
  for each row execute function public.tg_membership_guard();

create policy inv_admin on public.lab_invitations for all to authenticated
  using (is_lab_admin(laboratory_id)) with check (is_lab_admin(laboratory_id));

-- Operational reference data: members read, admins write
do $$
declare t text;
begin
  foreach t in array array['technicians','trays','clinics','dentists','prosthetic_categories','services','production_stages'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (is_lab_member(laboratory_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (is_lab_admin(laboratory_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (is_lab_admin(laboratory_id)) with check (is_lab_admin(laboratory_id))', t);
  end loop;
end $$;
create policy dentists_delete on public.dentists for delete to authenticated using (is_lab_admin(laboratory_id));

-- Patients: minimized visibility
create policy patients_select on public.patients for select to authenticated using (can_see_patient(id));
create policy patients_insert on public.patients for insert to authenticated with check (is_lab_admin(laboratory_id));
create policy patients_update on public.patients for update to authenticated
  using (is_lab_admin(laboratory_id)) with check (is_lab_admin(laboratory_id));

-- Cases: all members see operational case data (tray board); writes go through workflow functions
create policy cases_select on public.cases for select to authenticated using (is_lab_member(laboratory_id));

-- Admin-only financial tables
do $$
declare t text;
begin
  foreach t in array array['case_financials','service_prices','labor_rates','operating_expenses','invoices',
                           'invoice_lines','payments','payment_allocations','credit_notes','lab_counters'] loop
    execute format('create policy %1$s_admin_select on public.%1$I for select to authenticated using (is_lab_admin(laboratory_id))', t);
  end loop;
end $$;
-- Direct writes allowed only where no cross-row invariant exists; everything else via functions.
create policy service_prices_insert on public.service_prices for insert to authenticated with check (is_lab_admin(laboratory_id));
create policy labor_rates_insert on public.labor_rates for insert to authenticated with check (is_lab_admin(laboratory_id));
create policy opex_insert on public.operating_expenses for insert to authenticated with check (is_lab_admin(laboratory_id));
create policy opex_update on public.operating_expenses for update to authenticated using (is_lab_admin(laboratory_id)) with check (is_lab_admin(laboratory_id));
create policy opex_delete on public.operating_expenses for delete to authenticated using (is_lab_admin(laboratory_id));

-- Case cost records: admins and explicitly authorized cost managers
create policy material_catalog_select on public.material_catalog for select to authenticated using (can_manage_costs(laboratory_id));
create policy material_catalog_insert on public.material_catalog for insert to authenticated with check (is_lab_admin(laboratory_id));
create policy material_catalog_update on public.material_catalog for update to authenticated using (is_lab_admin(laboratory_id)) with check (is_lab_admin(laboratory_id));

do $$
declare t text;
begin
  foreach t in array array['case_material_costs','case_labor_entries','case_other_direct_costs'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (can_manage_costs(laboratory_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (can_manage_costs(laboratory_id))', t);
  end loop;
end $$;
create policy other_costs_insert on public.case_other_direct_costs for insert to authenticated
  with check (can_manage_costs(laboratory_id) and exists (select 1 from cases c where c.id = case_id and c.laboratory_id = case_other_direct_costs.laboratory_id));

-- History & activity: members read
create policy ta_select on public.tray_assignments for select to authenticated using (is_lab_member(laboratory_id));
create policy csh_select on public.case_status_history for select to authenticated using (is_lab_member(laboratory_id));
create policy act_select on public.activity_logs for select to authenticated using (is_lab_member(laboratory_id));
create policy audit_select on public.financial_audit_log for select to authenticated using (is_lab_admin(laboratory_id));

-- Notes & attachments
create policy notes_select on public.case_notes for select to authenticated using (is_lab_member(laboratory_id));
create policy notes_insert on public.case_notes for insert to authenticated with check (
  is_lab_member(laboratory_id) and author_id = auth.uid()
  and exists (select 1 from cases c where c.id = case_id and c.laboratory_id = case_notes.laboratory_id)
);
create policy notes_delete on public.case_notes for delete to authenticated using (author_id = auth.uid() or is_lab_admin(laboratory_id));
create policy att_select on public.case_attachments for select to authenticated using (is_lab_member(laboratory_id));
create policy att_insert on public.case_attachments for insert to authenticated with check (is_lab_member(laboratory_id) and uploaded_by = auth.uid());
create policy att_delete on public.case_attachments for delete to authenticated using (uploaded_by = auth.uid() or is_lab_admin(laboratory_id));

-- Notifications: own only
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Financial audit trail (who changed what, before/after)
-- ─────────────────────────────────────────────────────────────
create or replace function public.tg_financial_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lab uuid;
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_lab := old.laboratory_id; v_id := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'case_id');
  else
    v_lab := new.laboratory_id; v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'case_id');
  end if;
  insert into financial_audit_log (laboratory_id, table_name, record_id, action, old_data, new_data, changed_by)
  values (v_lab, tg_table_name, v_id, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['case_financials','service_prices','material_catalog','case_material_costs',
                           'labor_rates','case_labor_entries','case_other_direct_costs','operating_expenses',
                           'invoices','invoice_lines','payments','payment_allocations','credit_notes'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function public.tg_financial_audit()', t);
  end loop;
end $$;

-- Recorded payments and credits are immutable (corrections are new records).
create or replace function public.tg_immutable() returns trigger language plpgsql as $$
begin
  raise exception '% records cannot be modified or deleted; record a correcting entry instead', tg_table_name;
end $$;
create trigger payments_immutable before update or delete on public.payments for each row execute function public.tg_immutable();
create trigger allocations_immutable before update or delete on public.payment_allocations for each row execute function public.tg_immutable();
create trigger credits_immutable before update or delete on public.credit_notes for each row execute function public.tg_immutable();

-- Delivered/cancelled cases' financial history is frozen once invoiced.
create or replace function public.tg_case_financials_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from invoice_lines l where l.case_id = new.case_id and not l.voided)
     and (new.selling_price is distinct from old.selling_price or new.discount_amount is distinct from old.discount_amount) then
    raise exception 'This case is already invoiced. Void the invoice or issue a credit note to change its price.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger case_financials_guard before update on public.case_financials
  for each row execute function public.tg_case_financials_guard();

-- ─────────────────────────────────────────────────────────────
-- New auth user → profile + accept pending invitations
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
begin
  insert into profiles (id, email, full_name) values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  for inv in
    select * from lab_invitations i where lower(i.email) = lower(new.email) and i.accepted_at is null
  loop
    insert into laboratory_memberships (laboratory_id, user_id, role, can_manage_costs)
    values (inv.laboratory_id, new.id, inv.role, inv.can_manage_costs)
    on conflict (laboratory_id, user_id) do nothing;

    if inv.technician_id is not null then
      update technicians set user_id = new.id where id = inv.technician_id and user_id is null;
    elsif inv.role = 'technician' then
      insert into technicians (laboratory_id, user_id, full_name) values (inv.laboratory_id, new.id, v_name)
      on conflict (laboratory_id, user_id) do nothing;
    end if;

    update lab_invitations set accepted_at = now() where id = inv.id;
    update profiles set active_laboratory_id = coalesce(active_laboratory_id, inv.laboratory_id) where id = new.id;
  end loop;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Derived views (security_invoker → caller's RLS applies)
-- ─────────────────────────────────────────────────────────────
create or replace view public.case_cost_summary with (security_invoker = true) as
select
  c.id as case_id,
  c.laboratory_id,
  coalesce(m.total, 0)::numeric(14,2) as material_total,
  coalesce(m.n, 0)::int as material_entries,
  coalesce(l.total, 0)::numeric(14,2) as labor_total,
  coalesce(l.n, 0)::int as labor_entries,
  coalesce(o.total, 0)::numeric(14,2) as other_total,
  coalesce(o.n, 0)::int as other_entries,
  (coalesce(m.total, 0) + coalesce(l.total, 0) + coalesce(o.total, 0))::numeric(14,2) as total_recorded,
  (coalesce(m.est, 0) + coalesce(l.est, 0) + coalesce(o.est, 0))::int as estimate_entries,
  c.materials_confirmed,
  c.labor_confirmed,
  c.other_costs_confirmed,
  -- complete = every section explicitly confirmed and no estimates remain
  (c.materials_confirmed and c.labor_confirmed and c.other_costs_confirmed
     and coalesce(m.est, 0) + coalesce(l.est, 0) + coalesce(o.est, 0) = 0) as costs_complete
from public.cases c
left join lateral (
  select sum(line_total) total, count(*) n, count(*) filter (where basis = 'estimate') est
  from public.case_material_costs x where x.case_id = c.id
) m on true
left join lateral (
  select sum(amount) total, count(*) n, count(*) filter (where basis = 'estimate') est
  from public.case_labor_entries x where x.case_id = c.id
) l on true
left join lateral (
  select sum(amount) total, count(*) n, count(*) filter (where basis = 'estimate') est
  from public.case_other_direct_costs x where x.case_id = c.id
) o on true;

create or replace view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.laboratory_id,
  i.clinic_id,
  i.number,
  i.status,
  i.issue_date,
  i.due_date,
  coalesce(li.total, 0)::numeric(14,2) as total,
  coalesce(pa.paid, 0)::numeric(14,2) as paid,
  coalesce(cn.credited, 0)::numeric(14,2) as credited,
  case when i.status = 'issued'
       then (coalesce(li.total, 0) - coalesce(pa.paid, 0) - coalesce(cn.credited, 0))
       else 0 end::numeric(14,2) as outstanding,
  case
    when i.status = 'void' then 'void'
    when i.status = 'draft' then 'draft'
    when coalesce(li.total, 0) - coalesce(pa.paid, 0) - coalesce(cn.credited, 0) <= 0 then 'paid'
    when coalesce(pa.paid, 0) + coalesce(cn.credited, 0) > 0 then 'partially_paid'
    else 'unpaid'
  end as payment_status
from public.invoices i
left join lateral (select sum(amount) total from public.invoice_lines l where l.invoice_id = i.id and not l.voided) li on true
left join lateral (select sum(amount) paid from public.payment_allocations a where a.invoice_id = i.id) pa on true
left join lateral (select sum(amount) credited from public.credit_notes c where c.invoice_id = i.id) cn on true;

-- Tray board view: each tray with its current case (if any).
create or replace view public.tray_board with (security_invoker = true) as
select
  t.id as tray_id,
  t.laboratory_id,
  t.number,
  t.label,
  t.is_active,
  a.id as assignment_id,
  a.assigned_at,
  c.id as case_id,
  c.reference as case_reference,
  c.due_date,
  c.priority,
  c.lifecycle,
  s.name as stage_name,
  s.position as stage_position,
  tech.id as technician_id,
  tech.full_name as technician_name,
  cat.name as category_name,
  cl.name as clinic_name,
  c.patient_id
from public.trays t
left join public.tray_assignments a on a.tray_id = t.id and a.released_at is null
left join public.cases c on c.id = a.case_id
left join public.production_stages s on s.id = c.stage_id
left join public.technicians tech on tech.id = c.technician_id
left join public.prosthetic_categories cat on cat.id = c.category_id
left join public.clinics cl on cl.id = c.clinic_id;
