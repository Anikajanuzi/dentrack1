-- DENTRACK workflow functions.
-- All multi-row invariants (tray occupancy, stage transitions, billing, payments) are enforced here,
-- inside single transactions with row locks. SECURITY DEFINER + explicit permission checks.

create policy stages_delete on public.production_stages for delete to authenticated
  using (is_lab_admin(laboratory_id) and system_key is null);

-- ─────────────────────────────────────────────────────────────
-- Internal helpers
-- ─────────────────────────────────────────────────────────────
create or replace function public.lab_today(p_lab uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone l.timezone)::date from laboratories l where l.id = p_lab
$$;

create or replace function public.tray_code(p_number int) returns text
language sql immutable as $$ select '#' || lpad(p_number::text, 3, '0') $$;

create or replace function public._log(p_lab uuid, p_action text, p_summary text,
  p_case uuid default null, p_tray uuid default null, p_meta jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into activity_logs (laboratory_id, actor_id, case_id, tray_id, action, summary, metadata)
  values (p_lab, auth.uid(), p_case, p_tray, p_action, p_summary, coalesce(p_meta, '{}'::jsonb))
$$;

create or replace function public._notify(p_lab uuid, p_user uuid, p_type text, p_title text,
  p_body text default null, p_link text default null, p_case uuid default null, p_dedupe text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_enabled boolean;
begin
  if p_user is null then return; end if;
  select coalesce((m.notification_prefs ->> p_type)::boolean, true) into v_enabled
  from laboratory_memberships m where m.laboratory_id = p_lab and m.user_id = p_user and m.is_active;
  if v_enabled is distinct from true then return; end if; -- not a member, or opted out
  insert into notifications (laboratory_id, user_id, type, title, body, link, case_id, dedupe_key)
  values (p_lab, p_user, p_type, p_title, p_body, p_link, p_case, p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

create or replace function public._notify_admins(p_lab uuid, p_type text, p_title text,
  p_body text default null, p_link text default null, p_case uuid default null, p_dedupe text default null,
  p_exclude_actor boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from laboratory_memberships
           where laboratory_id = p_lab and role = 'admin' and is_active
             and (not p_exclude_actor or user_id is distinct from auth.uid()) loop
    perform _notify(p_lab, r.user_id, p_type, p_title, p_body, p_link, p_case, p_dedupe);
  end loop;
end $$;

create or replace function public._next_counter(p_lab uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into lab_counters (laboratory_id, key, value) values (p_lab, p_key, 1)
  on conflict (laboratory_id, key) do update set value = lab_counters.value + 1
  returning value into v;
  return v;
end $$;

-- Guard: an id must belong to the given laboratory (multi-tenant integrity).
create or replace function public._same_lab(p_table text, p_id uuid, p_lab uuid, p_label text) returns void
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if p_id is null then return; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and laboratory_id = $2)', p_table)
    into ok using p_id, p_lab;
  if not ok then raise exception '% not found in this laboratory', p_label using errcode = 'P0002'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Laboratory onboarding
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_laboratory(p_name text, p_timezone text default 'UTC',
  p_currency text default 'EUR', p_tray_count int default 0, p_is_demo boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lab uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_tray_count < 0 or p_tray_count > 500 then raise exception 'Tray count must be between 0 and 500'; end if;
  perform now() at time zone p_timezone; -- validates timezone name

  insert into laboratories (name, timezone, currency, is_demo, created_by)
  values (trim(p_name), p_timezone, upper(p_currency), p_is_demo, v_uid) returning id into v_lab;

  insert into laboratory_memberships (laboratory_id, user_id, role, can_manage_costs)
  values (v_lab, v_uid, 'admin', true);

  insert into production_stages (laboratory_id, name, position, system_key) values
    (v_lab, 'Received', 10, 'received'),
    (v_lab, 'In Production', 20, null),
    (v_lab, 'Quality Check', 30, null),
    (v_lab, 'Completed', 90, 'completed'),
    (v_lab, 'Delivered', 100, 'delivered');

  -- Category names only. No prices are invented; admins configure them.
  insert into prosthetic_categories (laboratory_id, name, position)
  select v_lab, n, o from unnest(array[
    'Zirconia crowns', 'Metal-ceramic crowns', 'Acrylic dentures', 'Flexible dentures', 'Bridges',
    'Implant-supported prosthetics', 'Retainers', 'Repairs', 'Relines', 'Custom services'
  ]) with ordinality as x(n, o);

  insert into trays (laboratory_id, number) select v_lab, g from generate_series(1, p_tray_count) g;

  update profiles set active_laboratory_id = v_lab where id = v_uid;
  perform _log(v_lab, 'lab.created', 'Laboratory created');
  return v_lab;
end $$;

create or replace function public.set_active_laboratory(p_lab uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_member(p_lab);
  update profiles set active_laboratory_id = p_lab where id = auth.uid();
end $$;

-- ─────────────────────────────────────────────────────────────
-- Trays
-- ─────────────────────────────────────────────────────────────
create or replace function public.add_trays(p_lab uuid, p_from int, p_to int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform assert_admin(p_lab);
  if p_from < 1 or p_to > 9999 or p_to < p_from or p_to - p_from >= 500 then
    raise exception 'Choose a range between 1 and 9999 (max 500 trays at once)';
  end if;
  insert into trays (laboratory_id, number) select p_lab, g from generate_series(p_from, p_to) g
  on conflict (laboratory_id, number) do nothing;
  get diagnostics n = row_count;
  perform _log(p_lab, 'tray.added', format('Added %s tray(s) %s–%s', n, tray_code(p_from), tray_code(p_to)));
  return n;
end $$;

create or replace function public.set_tray_active(p_tray uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t trays;
begin
  select * into t from trays where id = p_tray for update;
  if not found then raise exception 'Tray not found' using errcode = 'P0002'; end if;
  perform assert_admin(t.laboratory_id);
  if not p_active and exists (select 1 from tray_assignments where tray_id = p_tray and released_at is null) then
    raise exception 'Tray % is occupied. Release it before deactivating.', tray_code(t.number);
  end if;
  update trays set is_active = p_active, deactivated_at = case when p_active then null else now() end where id = p_tray;
  perform _log(t.laboratory_id, case when p_active then 'tray.activated' else 'tray.deactivated' end,
    format('Tray %s %s', tray_code(t.number), case when p_active then 'reactivated' else 'deactivated' end), null, p_tray);
end $$;

-- Core assignment primitive. Caller must hold permission. Locks tray then case.
create or replace function public._assign_tray(p_tray uuid, p_case uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t trays;
  c cases;
  v_id uuid;
  v_constraint text;
begin
  select * into t from trays where id = p_tray for update;
  if not found then raise exception 'Tray not found' using errcode = 'P0002'; end if;
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  if t.laboratory_id <> c.laboratory_id then raise exception 'Tray and case belong to different laboratories'; end if;
  if not t.is_active then raise exception 'Tray % is deactivated', tray_code(t.number); end if;
  if c.archived_at is not null then raise exception 'Archived cases cannot be placed in a tray'; end if;
  if c.lifecycle in ('cancelled', 'delivered') then raise exception 'A % case cannot be placed in a tray', c.lifecycle; end if;
  if exists (select 1 from tray_assignments where tray_id = p_tray and released_at is null) then
    raise exception 'Tray % is already occupied', tray_code(t.number);
  end if;
  if exists (select 1 from tray_assignments where case_id = p_case and released_at is null) then
    raise exception 'Case % is already in another tray', c.reference;
  end if;

  insert into tray_assignments (laboratory_id, tray_id, case_id, assigned_by)
  values (t.laboratory_id, p_tray, p_case, auth.uid()) returning id into v_id;

  perform _log(t.laboratory_id, 'tray.assigned',
    format('Case %s placed in tray %s', c.reference, tray_code(t.number)), p_case, p_tray,
    jsonb_build_object('tray_number', t.number));
  return v_id;
exception when unique_violation then
  -- A concurrent transaction won the race; the partial unique indexes are the final guarantee.
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'case_one_active_tray' then
    raise exception 'Case % was just placed in another tray. Refresh and try again.', c.reference;
  end if;
  raise exception 'Tray % was just taken by another assignment. Refresh and choose another tray.', tray_code(t.number);
end $$;

create or replace function public.assign_tray(p_tray uuid, p_case uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lab uuid;
begin
  select laboratory_id into v_lab from trays where id = p_tray;
  if v_lab is null then raise exception 'Tray not found' using errcode = 'P0002'; end if;
  perform assert_member(v_lab);
  return _assign_tray(p_tray, p_case);
end $$;

-- Physical release: the user must confirm the tray is empty. Completing a case never calls this.
create or replace function public.release_tray(p_tray uuid, p_confirm_empty boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  t trays;
  a tray_assignments;
  c cases;
begin
  select * into t from trays where id = p_tray for update;
  if not found then raise exception 'Tray not found' using errcode = 'P0002'; end if;
  perform assert_member(t.laboratory_id);
  if p_confirm_empty is distinct from true then
    raise exception 'Confirm that tray % is physically empty before releasing it', tray_code(t.number);
  end if;
  select * into a from tray_assignments where tray_id = p_tray and released_at is null for update;
  if not found then raise exception 'Tray % is already available', tray_code(t.number); end if;
  select * into c from cases where id = a.case_id;
  if c.lifecycle = 'active' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Case % is still in production. Give a reason for releasing its tray.', c.reference;
  end if;

  update tray_assignments
     set released_at = now(), released_by = auth.uid(), release_confirmed_empty = true, release_reason = nullif(trim(p_reason), '')
   where id = a.id;

  perform _log(t.laboratory_id, 'tray.released',
    format('Tray %s released (case %s)', tray_code(t.number), c.reference), c.id, p_tray,
    jsonb_build_object('tray_number', t.number, 'reason', p_reason));
end $$;

-- Move a case to another tray (physical transfer). Old tray must be confirmed empty.
create or replace function public.move_case_to_tray(p_case uuid, p_new_tray uuid, p_confirm_old_empty boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c cases;
  a tray_assignments;
  old_t trays;
  new_t trays;
  v_id uuid;
  r record;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_member(c.laboratory_id);
  select * into new_t from trays where id = p_new_tray;
  -- lock both trays in a stable order to avoid deadlocks
  for r in select id from trays where id in (p_new_tray, (select tray_id from tray_assignments where case_id = p_case and released_at is null)) order by id for update loop end loop;
  select * into a from tray_assignments where case_id = p_case and released_at is null for update;
  if found then
    if a.tray_id = p_new_tray then raise exception 'Case is already in this tray'; end if;
    if p_confirm_old_empty is distinct from true then raise exception 'Confirm the previous tray is physically empty'; end if;
    select * into old_t from trays where id = a.tray_id;
    update tray_assignments set released_at = now(), released_by = auth.uid(), release_confirmed_empty = true,
           release_reason = 'Moved to tray ' || tray_code(new_t.number)
     where id = a.id;
  end if;
  v_id := _assign_tray(p_new_tray, p_case);
  if old_t.id is not null then
    perform _log(c.laboratory_id, 'tray.reassigned',
      format('Case %s moved from tray %s to %s', c.reference, tray_code(old_t.number), tray_code(new_t.number)),
      p_case, p_new_tray);
    perform _notify(c.laboratory_id, (select user_id from technicians where id = c.technician_id),
      'tray_reassigned', format('Case %s moved to tray %s', c.reference, tray_code(new_t.number)),
      format('Previously in tray %s', tray_code(old_t.number)), '/cases/' || c.id, c.id, null)
      where (select user_id from technicians where id = c.technician_id) is distinct from auth.uid();
  end if;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Cases
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_case(p_lab uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_case uuid;
  v_ref text;
  v_patient uuid := nullif(p ->> 'patient_id', '')::uuid;
  v_clinic uuid := nullif(p ->> 'clinic_id', '')::uuid;
  v_dentist uuid := nullif(p ->> 'dentist_id', '')::uuid;
  v_category uuid := nullif(p ->> 'category_id', '')::uuid;
  v_service uuid := nullif(p ->> 'service_id', '')::uuid;
  v_tech uuid := nullif(p ->> 'technician_id', '')::uuid;
  v_tray uuid := nullif(p ->> 'tray_id', '')::uuid;
  v_received date := coalesce(nullif(p ->> 'received_date', '')::date, lab_today(p_lab));
  v_due date := nullif(p ->> 'due_date', '')::date;
  v_stage uuid;
  v_price numeric(12,2) := nullif(p ->> 'selling_price', '')::numeric;
  v_discount numeric(12,2) := coalesce(nullif(p ->> 'discount_amount', '')::numeric, 0);
  v_est numeric(12,2) := nullif(p ->> 'estimated_direct_cost', '')::numeric;
  v_source text;
  v_tech_user uuid;
begin
  perform assert_member(p_lab);
  v_admin := is_lab_admin(p_lab);

  if v_due is null then raise exception 'Due date is required'; end if;
  if v_due < v_received then raise exception 'Due date cannot be before the date received'; end if;
  if v_clinic is null then raise exception 'Dental clinic is required'; end if;
  if v_category is null then raise exception 'Prosthetic category is required'; end if;
  if not v_admin and (v_price is not null or v_est is not null or (p ? 'discount_amount' and v_discount <> 0)) then
    raise exception 'Only administrators can set prices' using errcode = '42501';
  end if;

  perform _same_lab('clinics', v_clinic, p_lab, 'Clinic');
  perform _same_lab('dentists', v_dentist, p_lab, 'Dentist');
  perform _same_lab('prosthetic_categories', v_category, p_lab, 'Category');
  perform _same_lab('services', v_service, p_lab, 'Service');
  perform _same_lab('technicians', v_tech, p_lab, 'Technician');
  perform _same_lab('trays', v_tray, p_lab, 'Tray');
  if v_dentist is not null and not exists (select 1 from dentists where id = v_dentist and clinic_id = v_clinic) then
    raise exception 'Dentist does not belong to the selected clinic';
  end if;
  if v_service is not null and not exists (select 1 from services where id = v_service and category_id = v_category) then
    raise exception 'Service does not belong to the selected category';
  end if;

  -- Patient: existing id, or a new reference (optionally with name)
  if v_patient is not null then
    perform _same_lab('patients', v_patient, p_lab, 'Patient');
  else
    if coalesce(trim(p ->> 'patient_reference'), '') = '' then raise exception 'Patient reference is required'; end if;
    select id into v_patient from patients where laboratory_id = p_lab and reference = trim(p ->> 'patient_reference');
    if v_patient is null then
      insert into patients (laboratory_id, clinic_id, reference, full_name)
      values (p_lab, v_clinic, trim(p ->> 'patient_reference'), nullif(trim(p ->> 'patient_name'), ''))
      returning id into v_patient;
    end if;
  end if;

  v_ref := nullif(trim(p ->> 'reference'), '');
  if v_ref is null then
    v_ref := format('C-%s-%s', to_char(v_received, 'YYYY'), lpad(_next_counter(p_lab, 'case:' || to_char(v_received, 'YYYY'))::text, 4, '0'));
  end if;
  if exists (select 1 from cases where laboratory_id = p_lab and reference = v_ref) then
    raise exception 'Case reference % already exists', v_ref using errcode = '23505';
  end if;

  select id into v_stage from production_stages where laboratory_id = p_lab and system_key = 'received';

  insert into cases (laboratory_id, reference, patient_id, clinic_id, dentist_id, category_id, service_id, technician_id,
                     stage_id, priority, units, tooth_numbers, shade, received_date, due_date, notes, created_by)
  values (p_lab, v_ref, v_patient, v_clinic, v_dentist, v_category, v_service, v_tech, v_stage,
          coalesce(nullif(p ->> 'priority', '')::case_priority, 'normal'),
          coalesce(nullif(p ->> 'units', '')::int, 1),
          nullif(trim(p ->> 'tooth_numbers'), ''), nullif(trim(p ->> 'shade'), ''),
          v_received, v_due, nullif(trim(p ->> 'notes'), ''), v_uid)
  returning id into v_case;

  insert into case_status_history (laboratory_id, case_id, from_stage_id, to_stage_id, changed_by, note)
  values (p_lab, v_case, null, v_stage, v_uid, 'Case received');

  -- Price snapshot: explicit admin price, else the price list effective on the received date.
  if v_price is not null then
    v_source := 'manual';
  elsif v_service is not null then
    select sp.price * coalesce(nullif(p ->> 'units', '')::int, 1) into v_price
    from service_prices sp where sp.service_id = v_service and sp.effective_from <= v_received
    order by sp.effective_from desc limit 1;
    if v_price is not null then v_source := 'price_list'; end if;
  end if;
  if v_discount > coalesce(v_price, 0) and v_discount > 0 then raise exception 'Discount cannot exceed the selling price'; end if;
  insert into case_financials (case_id, laboratory_id, selling_price, discount_amount, estimated_direct_cost, price_source, updated_by)
  values (v_case, p_lab, v_price, v_discount, v_est, v_source, v_uid);

  perform _log(p_lab, 'case.created', format('Case %s created', v_ref), v_case);

  if v_tray is not null then
    perform _assign_tray(v_tray, v_case);
  end if;

  if v_tech is not null then
    select user_id into v_tech_user from technicians where id = v_tech;
    if v_tech_user is distinct from v_uid then
      perform _notify(p_lab, v_tech_user, 'assignment', format('New case assigned: %s', v_ref),
        format('Due %s', to_char(v_due, 'DD Mon YYYY')), '/cases/' || v_case, v_case, null);
    end if;
  end if;
  return v_case;
end $$;

create or replace function public.update_case(p_case uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  c cases;
  v_admin boolean;
  v_new_tech uuid;
  v_tech_user uuid;
  k text;
  v_tech_fields text[] := array['notes', 'shade', 'tooth_numbers'];
begin
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_member(c.laboratory_id);
  v_admin := is_lab_admin(c.laboratory_id);
  if c.archived_at is not null then raise exception 'Restore the case before editing it'; end if;

  if not v_admin then
    if not is_case_assignee(p_case) then raise exception 'Only the assigned technician or an administrator can edit this case' using errcode = '42501'; end if;
    for k in select jsonb_object_keys(p) loop
      if not k = any (v_tech_fields) then raise exception 'Technicians can only edit notes, shade and tooth numbers' using errcode = '42501'; end if;
    end loop;
  end if;

  if p ? 'clinic_id' then perform _same_lab('clinics', nullif(p ->> 'clinic_id','')::uuid, c.laboratory_id, 'Clinic'); end if;
  if p ? 'dentist_id' then perform _same_lab('dentists', nullif(p ->> 'dentist_id','')::uuid, c.laboratory_id, 'Dentist'); end if;
  if p ? 'category_id' then perform _same_lab('prosthetic_categories', nullif(p ->> 'category_id','')::uuid, c.laboratory_id, 'Category'); end if;
  if p ? 'service_id' then perform _same_lab('services', nullif(p ->> 'service_id','')::uuid, c.laboratory_id, 'Service'); end if;
  if p ? 'technician_id' then perform _same_lab('technicians', nullif(p ->> 'technician_id','')::uuid, c.laboratory_id, 'Technician'); end if;
  if p ? 'patient_id' then perform _same_lab('patients', nullif(p ->> 'patient_id','')::uuid, c.laboratory_id, 'Patient'); end if;
  if p ? 'clinic_id' and exists (select 1 from invoice_lines l where l.case_id = p_case and not l.voided)
     and nullif(p ->> 'clinic_id','')::uuid is distinct from c.clinic_id then
    raise exception 'This case is invoiced; its clinic cannot change';
  end if;

  update cases set
    reference     = case when p ? 'reference' then coalesce(nullif(trim(p ->> 'reference'), ''), reference) else reference end,
    patient_id    = case when p ? 'patient_id' then coalesce(nullif(p ->> 'patient_id','')::uuid, patient_id) else patient_id end,
    clinic_id     = case when p ? 'clinic_id' then coalesce(nullif(p ->> 'clinic_id','')::uuid, clinic_id) else clinic_id end,
    dentist_id    = case when p ? 'dentist_id' then nullif(p ->> 'dentist_id','')::uuid else dentist_id end,
    category_id   = case when p ? 'category_id' then coalesce(nullif(p ->> 'category_id','')::uuid, category_id) else category_id end,
    service_id    = case when p ? 'service_id' then nullif(p ->> 'service_id','')::uuid else service_id end,
    technician_id = case when p ? 'technician_id' then nullif(p ->> 'technician_id','')::uuid else technician_id end,
    priority      = case when p ? 'priority' then (p ->> 'priority')::case_priority else priority end,
    units         = case when p ? 'units' then (p ->> 'units')::int else units end,
    received_date = case when p ? 'received_date' then (p ->> 'received_date')::date else received_date end,
    due_date      = case when p ? 'due_date' then (p ->> 'due_date')::date else due_date end,
    tooth_numbers = case when p ? 'tooth_numbers' then nullif(trim(p ->> 'tooth_numbers'), '') else tooth_numbers end,
    shade         = case when p ? 'shade' then nullif(trim(p ->> 'shade'), '') else shade end,
    notes         = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end
  where id = p_case;

  if exists (select 1 from cases x where x.id = p_case and x.dentist_id is not null
             and not exists (select 1 from dentists d where d.id = x.dentist_id and d.clinic_id = x.clinic_id)) then
    raise exception 'Dentist does not belong to the selected clinic';
  end if;

  v_new_tech := nullif(p ->> 'technician_id', '')::uuid;
  if p ? 'technician_id' and v_new_tech is distinct from c.technician_id then
    perform _log(c.laboratory_id, 'case.reassigned',
      format('Case %s reassigned to %s', c.reference, coalesce((select full_name from technicians where id = v_new_tech), 'nobody')), p_case);
    select user_id into v_tech_user from technicians where id = v_new_tech;
    if v_tech_user is distinct from auth.uid() then
      perform _notify(c.laboratory_id, v_tech_user, 'assignment', format('Case assigned to you: %s', c.reference),
        null, '/cases/' || p_case, p_case, null);
    end if;
  else
    perform _log(c.laboratory_id, 'case.updated', format('Case %s details updated', c.reference), p_case,
      null, jsonb_build_object('fields', (select jsonb_agg(x) from jsonb_object_keys(p) x)));
  end if;
end $$;

create or replace function public.move_case_stage(p_case uuid, p_stage uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c cases;
  s_from production_stages;
  s_to production_stages;
  v_admin boolean;
  v_tech_user uuid;
begin
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_member(c.laboratory_id);
  v_admin := is_lab_admin(c.laboratory_id);
  if not v_admin and c.technician_id is not null and not is_case_assignee(p_case) then
    raise exception 'Only the assigned technician or an administrator can change this case''s stage' using errcode = '42501';
  end if;
  if c.archived_at is not null then raise exception 'Archived cases cannot change stage'; end if;
  if c.lifecycle = 'cancelled' then raise exception 'Cancelled cases cannot change stage'; end if;

  select * into s_from from production_stages where id = c.stage_id;
  select * into s_to from production_stages where id = p_stage and laboratory_id = c.laboratory_id;
  if not found then raise exception 'Stage not found' using errcode = 'P0002'; end if;
  if s_to.id = s_from.id then return; end if;
  if c.lifecycle = 'delivered' and not v_admin then
    raise exception 'Only an administrator can move a delivered case back into production' using errcode = '42501';
  end if;

  update cases set
    stage_id = s_to.id,
    lifecycle = case s_to.system_key when 'completed' then 'completed'::case_lifecycle
                                     when 'delivered' then 'delivered'::case_lifecycle
                                     else 'active'::case_lifecycle end,
    completed_at = case when s_to.system_key in ('completed', 'delivered') then coalesce(completed_at, now()) else null end,
    delivered_at = case when s_to.system_key = 'delivered' then now() else null end
  where id = p_case;

  insert into case_status_history (laboratory_id, case_id, from_stage_id, to_stage_id, changed_by, note)
  values (c.laboratory_id, p_case, s_from.id, s_to.id, auth.uid(), nullif(trim(p_note), ''));

  perform _log(c.laboratory_id, 'case.stage',
    format('Case %s moved from %s to %s', c.reference, s_from.name, s_to.name), p_case, null,
    jsonb_build_object('from', s_from.name, 'to', s_to.name, 'system_key', s_to.system_key));

  select user_id into v_tech_user from technicians where id = c.technician_id;
  if v_tech_user is distinct from auth.uid() then
    perform _notify(c.laboratory_id, v_tech_user, 'status_change', format('%s is now %s', c.reference, s_to.name),
      null, '/cases/' || p_case, p_case, null);
  end if;
  if s_to.system_key = 'completed' then
    perform _notify_admins(c.laboratory_id, 'case_completed', format('Case %s completed', c.reference),
      case when exists (select 1 from tray_assignments where case_id = p_case and released_at is null)
           then 'Tray still occupied — release it once the work is removed.' end,
      '/cases/' || p_case, p_case, null);
  end if;
end $$;

create or replace function public.cancel_case(p_case uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_admin(c.laboratory_id);
  if c.lifecycle in ('delivered', 'cancelled') then raise exception 'A % case cannot be cancelled', c.lifecycle; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A cancellation reason is required'; end if;
  if exists (select 1 from invoice_lines l where l.case_id = p_case and not l.voided) then
    raise exception 'Void the invoice for this case before cancelling it';
  end if;
  update cases set lifecycle = 'cancelled', cancelled_at = now() where id = p_case;
  perform _log(c.laboratory_id, 'case.cancelled', format('Case %s cancelled: %s', c.reference, trim(p_reason)), p_case);
end $$;

create or replace function public.archive_case(p_case uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_admin(c.laboratory_id);
  if c.archived_at is not null then return; end if;
  if c.lifecycle not in ('delivered', 'cancelled') then
    raise exception 'Only delivered or cancelled cases can be archived';
  end if;
  if exists (select 1 from tray_assignments where case_id = p_case and released_at is null) then
    raise exception 'Release this case''s tray before archiving';
  end if;
  update cases set archived_at = now() where id = p_case;
  perform _log(c.laboratory_id, 'case.archived', format('Case %s archived', c.reference), p_case);
end $$;

create or replace function public.restore_case(p_case uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_admin(c.laboratory_id);
  update cases set archived_at = null where id = p_case;
  perform _log(c.laboratory_id, 'case.restored', format('Case %s restored from archive', c.reference), p_case);
end $$;

create or replace function public.add_case_note(p_case uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c cases; v uuid;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_member(c.laboratory_id);
  insert into case_notes (laboratory_id, case_id, author_id, body) values (c.laboratory_id, p_case, auth.uid(), trim(p_body))
  returning id into v;
  perform _log(c.laboratory_id, 'case.note', format('Note added to %s', c.reference), p_case);
  return v;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Pricing & direct costs
-- ─────────────────────────────────────────────────────────────
create or replace function public.update_case_pricing(p_case uuid, p_selling_price numeric, p_discount numeric,
  p_estimated_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_admin(c.laboratory_id);
  if coalesce(p_discount, 0) < 0 then raise exception 'Discount cannot be negative'; end if;
  if coalesce(p_discount, 0) > 0 and (p_selling_price is null or p_discount > p_selling_price) then
    raise exception 'Discount cannot exceed the selling price';
  end if;
  insert into case_financials (case_id, laboratory_id, selling_price, discount_amount, estimated_direct_cost, price_source, updated_by)
  values (p_case, c.laboratory_id, p_selling_price, coalesce(p_discount, 0), p_estimated_cost, 'manual', auth.uid())
  on conflict (case_id) do update set
    selling_price = excluded.selling_price,
    discount_amount = excluded.discount_amount,
    estimated_direct_cost = excluded.estimated_direct_cost,
    price_source = case when case_financials.selling_price is distinct from excluded.selling_price then 'manual' else case_financials.price_source end,
    updated_by = excluded.updated_by;
end $$;

create or replace function public.add_material_cost(p_case uuid, p_material_id uuid, p_material_name text, p_unit text,
  p_quantity numeric, p_unit_cost numeric, p_basis cost_basis default 'actual', p_recorded_on date default null,
  p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c cases;
  m material_catalog;
  v_cost numeric(12,4) := p_unit_cost;
  v_name text := nullif(trim(p_material_name), '');
  v_unit text := nullif(trim(p_unit), '');
  v uuid;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_cost_manager(c.laboratory_id);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_material_id is not null then
    select * into m from material_catalog where id = p_material_id and laboratory_id = c.laboratory_id;
    if not found then raise exception 'Material not found in this laboratory''s catalog' using errcode = 'P0002'; end if;
    v_name := coalesce(v_name, m.name);
    v_unit := coalesce(v_unit, m.unit);
    v_cost := coalesce(v_cost, m.default_unit_cost);
  end if;
  if v_name is null or v_unit is null then raise exception 'Material name and unit are required'; end if;
  if v_cost is null then raise exception 'No unit cost recorded for %. Enter the unit cost.', v_name; end if;
  if v_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;

  insert into case_material_costs (laboratory_id, case_id, material_id, material_name, unit, quantity, unit_cost, basis, recorded_on, notes, created_by)
  values (c.laboratory_id, p_case, p_material_id, v_name, v_unit, p_quantity, v_cost, coalesce(p_basis, 'actual'),
          coalesce(p_recorded_on, lab_today(c.laboratory_id)), nullif(trim(p_notes), ''), auth.uid())
  returning id into v;
  return v;
end $$;

create or replace function public.labor_rate_for(p_lab uuid, p_technician uuid, p_on date) returns numeric
language sql stable security definer set search_path = public as $$
  select hourly_rate from labor_rates
  where laboratory_id = p_lab and (technician_id = p_technician or technician_id is null) and effective_from <= p_on
  order by (technician_id is null), effective_from desc
  limit 1
$$;

create or replace function public.add_labor_entry(p_case uuid, p_technician uuid, p_task text, p_entry_type labor_entry_type,
  p_hours numeric default null, p_manual_amount numeric default null, p_rate_override numeric default null,
  p_basis cost_basis default 'actual', p_work_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c cases;
  v_date date;
  v_rate numeric(10,2);
  v_name text;
  v uuid;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_cost_manager(c.laboratory_id);
  perform _same_lab('technicians', p_technician, c.laboratory_id, 'Technician');
  v_date := coalesce(p_work_date, lab_today(c.laboratory_id));
  select full_name into v_name from technicians where id = p_technician;
  v_name := coalesce(v_name, 'Unassigned');

  if p_entry_type = 'hours' then
    if p_hours is null or p_hours <= 0 then raise exception 'Hours worked must be greater than zero'; end if;
    if p_rate_override is not null then
      if not is_lab_admin(c.laboratory_id) then raise exception 'Only administrators can override labor rates' using errcode = '42501'; end if;
      v_rate := p_rate_override;
    else
      v_rate := labor_rate_for(c.laboratory_id, p_technician, v_date);
      if v_rate is null then
        raise exception 'No labor rate is configured for % on %. Add one in Settings → Services, or record a manual labor cost.', v_name, v_date;
      end if;
    end if;
    insert into case_labor_entries (laboratory_id, case_id, technician_id, technician_name, task, entry_type, hours, hourly_rate, basis, work_date, created_by)
    values (c.laboratory_id, p_case, p_technician, v_name, trim(p_task), 'hours', p_hours, v_rate, coalesce(p_basis, 'actual'), v_date, auth.uid())
    returning id into v;
  else
    if p_manual_amount is null or p_manual_amount < 0 then raise exception 'Manual labor cost must be zero or more'; end if;
    insert into case_labor_entries (laboratory_id, case_id, technician_id, technician_name, task, entry_type, manual_amount, basis, work_date, created_by)
    values (c.laboratory_id, p_case, p_technician, v_name, trim(p_task), 'manual', p_manual_amount, coalesce(p_basis, 'actual'), v_date, auth.uid())
    returning id into v;
  end if;
  return v;
end $$;

create or replace function public.set_cost_section_confirmed(p_case uuid, p_section text, p_confirmed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_cost_manager(c.laboratory_id);
  case p_section
    when 'materials' then update cases set materials_confirmed = p_confirmed where id = p_case;
    when 'labor' then update cases set labor_confirmed = p_confirmed where id = p_case;
    when 'other' then update cases set other_costs_confirmed = p_confirmed where id = p_case;
    else raise exception 'Unknown cost section %', p_section;
  end case;
  perform _log(c.laboratory_id, 'case.costs', format('%s costs %s for %s', initcap(p_section),
    case when p_confirmed then 'confirmed complete' else 'reopened' end, c.reference), p_case);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Invoices, payments, credits
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_invoice(p_lab uuid, p_clinic uuid, p_case_ids uuid[], p_extra_lines jsonb default '[]',
  p_issue boolean default false, p_issue_date date default null, p_due_date date default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv uuid;
  v_year text;
  v_no text;
  r record;
  l jsonb;
  v_issue date := case when p_issue then coalesce(p_issue_date, lab_today(p_lab)) end;
begin
  perform assert_admin(p_lab);
  perform _same_lab('clinics', p_clinic, p_lab, 'Clinic');
  if coalesce(array_length(p_case_ids, 1), 0) = 0 and jsonb_array_length(coalesce(p_extra_lines, '[]')) = 0 then
    raise exception 'An invoice needs at least one line';
  end if;

  v_year := to_char(coalesce(v_issue, lab_today(p_lab)), 'YYYY');
  v_no := format('INV-%s-%s', v_year, lpad(_next_counter(p_lab, 'invoice:' || v_year)::text, 4, '0'));

  insert into invoices (laboratory_id, clinic_id, number, status, issue_date, due_date, notes, created_by)
  values (p_lab, p_clinic, v_no, case when p_issue then 'issued'::invoice_status else 'draft' end,
          v_issue, p_due_date, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_inv;

  for r in
    select c.id, c.reference, c.clinic_id, c.lifecycle, c.laboratory_id, f.selling_price, f.discount_amount,
           coalesce(s.name, cat.name) as item
    from unnest(p_case_ids) x(id)
    join cases c on c.id = x.id
    left join case_financials f on f.case_id = c.id
    left join services s on s.id = c.service_id
    join prosthetic_categories cat on cat.id = c.category_id
    for update of c
  loop
    if r.laboratory_id <> p_lab then raise exception 'Case not found in this laboratory'; end if;
    if r.clinic_id <> p_clinic then raise exception 'Case % belongs to a different clinic', r.reference; end if;
    if r.lifecycle = 'cancelled' then raise exception 'Case % is cancelled', r.reference; end if;
    if r.selling_price is null then raise exception 'Case % has no selling price', r.reference; end if;
    begin
      insert into invoice_lines (laboratory_id, invoice_id, case_id, description, quantity, unit_price)
      values (p_lab, v_inv, r.id, format('%s — %s', r.reference, r.item), 1, r.selling_price - r.discount_amount);
    exception when unique_violation then
      raise exception 'Case % is already invoiced', r.reference using errcode = '23505';
    end;
  end loop;
  if (select count(*) from invoice_lines where invoice_id = v_inv and case_id is not null) <> coalesce(array_length(p_case_ids, 1), 0) then
    raise exception 'One or more cases were not found';
  end if;

  for l in select * from jsonb_array_elements(coalesce(p_extra_lines, '[]')) loop
    insert into invoice_lines (laboratory_id, invoice_id, description, quantity, unit_price)
    values (p_lab, v_inv, l ->> 'description', coalesce((l ->> 'quantity')::numeric, 1), (l ->> 'unit_price')::numeric);
  end loop;

  perform _log(p_lab, 'invoice.created', format('Invoice %s %s', v_no, case when p_issue then 'issued' else 'drafted' end));
  return v_inv;
end $$;

create or replace function public.issue_invoice(p_invoice uuid, p_issue_date date default null, p_due_date date default null) returns void
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  select * into i from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  perform assert_admin(i.laboratory_id);
  if i.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  update invoices set status = 'issued', issue_date = coalesce(p_issue_date, lab_today(i.laboratory_id)),
         due_date = coalesce(p_due_date, due_date) where id = p_invoice;
  perform _log(i.laboratory_id, 'invoice.issued', format('Invoice %s issued', i.number));
end $$;

create or replace function public.void_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  select * into i from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  perform assert_admin(i.laboratory_id);
  if i.status = 'void' then return; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to void an invoice'; end if;
  if exists (select 1 from payment_allocations where invoice_id = p_invoice) or exists (select 1 from credit_notes where invoice_id = p_invoice) then
    raise exception 'Invoice % has payments or credits applied. Issue a credit note instead.', i.number;
  end if;
  update invoice_lines set voided = true where invoice_id = p_invoice;
  update invoices set status = 'void', voided_at = now(), void_reason = trim(p_reason) where id = p_invoice;
  perform _log(i.laboratory_id, 'invoice.voided', format('Invoice %s voided: %s', i.number, trim(p_reason)));
end $$;

-- Idempotent: the same idempotency key always returns the original payment, never a duplicate.
create or replace function public.record_payment(p_lab uuid, p_clinic uuid, p_amount numeric, p_payment_date date,
  p_method text, p_reference text, p_idempotency_key uuid, p_allocations jsonb default '[]', p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pay uuid;
  existing payments;
  a jsonb;
  v_inv uuid;
  v_amt numeric(12,2);
  v_total numeric(12,2) := 0;
  b record;
begin
  perform assert_admin(p_lab);
  if p_idempotency_key is null then raise exception 'Missing idempotency key'; end if;
  select * into existing from payments where laboratory_id = p_lab and idempotency_key = p_idempotency_key;
  if found then
    if existing.amount <> p_amount or existing.clinic_id <> p_clinic then
      raise exception 'This submission key was already used for a different payment';
    end if;
    return existing.id;
  end if;
  perform _same_lab('clinics', p_clinic, p_lab, 'Clinic');
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  if p_payment_date > lab_today(p_lab) then raise exception 'Payment date cannot be in the future'; end if;

  insert into payments (laboratory_id, clinic_id, amount, payment_date, method, reference, idempotency_key, notes, created_by)
  values (p_lab, p_clinic, p_amount, p_payment_date, coalesce(p_method, 'bank_transfer'), nullif(trim(p_reference), ''),
          p_idempotency_key, nullif(trim(p_notes), ''), auth.uid())
  on conflict (laboratory_id, idempotency_key) do nothing
  returning id into v_pay;
  if v_pay is null then -- concurrent duplicate submit
    select id into v_pay from payments where laboratory_id = p_lab and idempotency_key = p_idempotency_key;
    return v_pay;
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]')) loop
    v_inv := (a ->> 'invoice_id')::uuid;
    v_amt := (a ->> 'amount')::numeric;
    if v_amt is null or v_amt <= 0 then continue; end if;
    perform 1 from invoices where id = v_inv for update;
    select * into b from invoice_balances where invoice_id = v_inv;
    if not found or b.laboratory_id <> p_lab then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
    if b.clinic_id <> p_clinic then raise exception 'Invoice % belongs to a different clinic', b.number; end if;
    if b.status <> 'issued' then raise exception 'Invoice % is not issued', b.number; end if;
    if v_amt > b.outstanding then
      raise exception 'Allocation of % exceeds the outstanding balance of % on %', v_amt, b.outstanding, b.number;
    end if;
    v_total := v_total + v_amt;
    if v_total > p_amount then raise exception 'Allocations exceed the payment amount'; end if;
    insert into payment_allocations (laboratory_id, payment_id, invoice_id, amount) values (p_lab, v_pay, v_inv, v_amt);
  end loop;

  perform _log(p_lab, 'payment.recorded', format('Payment of %s %s recorded', p_amount,
    (select currency from laboratories where id = p_lab)));
  return v_pay;
end $$;

create or replace function public.allocate_payment(p_payment uuid, p_invoice uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  p payments;
  b record;
  v_unapplied numeric;
begin
  select * into p from payments where id = p_payment for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform assert_admin(p.laboratory_id);
  perform 1 from invoices where id = p_invoice for update;
  select * into b from invoice_balances where invoice_id = p_invoice;
  if not found or b.laboratory_id <> p.laboratory_id then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if b.clinic_id <> p.clinic_id then raise exception 'Invoice belongs to a different clinic'; end if;
  if b.status <> 'issued' then raise exception 'Invoice % is not issued', b.number; end if;
  select p.amount - coalesce(sum(amount), 0) into v_unapplied from payment_allocations where payment_id = p_payment;
  if p_amount <= 0 or p_amount > v_unapplied then raise exception 'Only % of this payment is unapplied', v_unapplied; end if;
  if p_amount > b.outstanding then raise exception 'Amount exceeds the outstanding balance of %', b.outstanding; end if;
  insert into payment_allocations (laboratory_id, payment_id, invoice_id, amount) values (p.laboratory_id, p_payment, p_invoice, p_amount);
end $$;

create or replace function public.add_credit_note(p_invoice uuid, p_amount numeric, p_reason text, p_issue_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b record;
  v uuid;
begin
  perform 1 from invoices where id = p_invoice for update;
  select * into b from invoice_balances where invoice_id = p_invoice;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  perform assert_admin(b.laboratory_id);
  if b.status <> 'issued' then raise exception 'Credits can only be applied to issued invoices'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Credit amount must be greater than zero'; end if;
  if p_amount > b.outstanding then raise exception 'Credit exceeds the outstanding balance of %', b.outstanding; end if;
  insert into credit_notes (laboratory_id, invoice_id, amount, reason, issue_date, created_by)
  values (b.laboratory_id, p_invoice, p_amount, trim(p_reason), coalesce(p_issue_date, lab_today(b.laboratory_id)), auth.uid())
  returning id into v;
  perform _log(b.laboratory_id, 'invoice.credit', format('Credit of %s applied to %s', p_amount, b.number));
  return v;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────────────────────
-- Idempotent: dedupe keys guarantee one reminder per case per due date per user.
create or replace function public.generate_deadline_notifications(p_lab uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_today date;
  v_soon int;
  v_before int;
  v_after int;
begin
  perform assert_member(p_lab);
  select lab_today(p_lab), due_soon_days into v_today, v_soon from laboratories where id = p_lab;
  select count(*) into v_before from notifications where laboratory_id = p_lab;
  for r in
    select c.id, c.reference, c.due_date, t.user_id as tech_user
    from cases c left join technicians t on t.id = c.technician_id
    where c.laboratory_id = p_lab and c.lifecycle = 'active' and c.archived_at is null
      and c.due_date <= v_today + v_soon
  loop
    if r.due_date < v_today then
      perform _notify(p_lab, r.tech_user, 'overdue', format('%s is overdue', r.reference),
        format('Was due %s', to_char(r.due_date, 'DD Mon YYYY')), '/cases/' || r.id, r.id, format('overdue:%s:%s', r.id, r.due_date));
      perform _notify_admins(p_lab, 'overdue', format('%s is overdue', r.reference),
        format('Was due %s', to_char(r.due_date, 'DD Mon YYYY')), '/cases/' || r.id, r.id, format('overdue:%s:%s', r.id, r.due_date), false);
    else
      perform _notify(p_lab, r.tech_user, 'due_soon', format('%s is due %s', r.reference,
          case when r.due_date = v_today then 'today' else to_char(r.due_date, 'DD Mon') end),
        null, '/cases/' || r.id, r.id, format('due:%s:%s', r.id, r.due_date));
      perform _notify_admins(p_lab, 'due_soon', format('%s is due %s', r.reference,
          case when r.due_date = v_today then 'today' else to_char(r.due_date, 'DD Mon') end),
        null, '/cases/' || r.id, r.id, format('due:%s:%s', r.id, r.due_date), false);
    end if;
  end loop;
  select count(*) into v_after from notifications where laboratory_id = p_lab;
  return v_after - v_before;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- Lock down internal helpers: not callable from the API.
revoke execute on function public._log(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._notify(uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public._notify_admins(uuid, text, text, text, text, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public._next_counter(uuid, text) from public, anon, authenticated;
revoke execute on function public._same_lab(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._assign_tray(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
