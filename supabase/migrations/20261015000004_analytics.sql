-- DENTRACK analytics. Every figure is computed from recorded rows with an explicit definition.
-- Dates are interpreted in the laboratory's timezone.

create or replace function public.local_date(p_ts timestamptz, p_tz text) returns date
language sql immutable as $$ select (p_ts at time zone p_tz)::date $$;

-- ─────────────────────────────────────────────────────────────
-- Dashboard (all members; finance block only for admins)
-- ─────────────────────────────────────────────────────────────
create or replace function public.dashboard_overview(p_lab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  v_soon int;
  v_admin boolean;
  v_month_start date;
  result jsonb;
begin
  perform assert_member(p_lab);
  v_admin := is_lab_admin(p_lab);
  select timezone, due_soon_days into v_tz, v_soon from laboratories where id = p_lab;
  v_today := lab_today(p_lab);
  v_month_start := date_trunc('month', v_today)::date;

  select jsonb_build_object(
    'today', v_today,
    'due_soon_days', v_soon,
    'trays', (
      select jsonb_build_object(
        'active', count(*) filter (where t.is_active),
        'occupied', count(*) filter (where t.is_active and a.id is not null),
        'available', count(*) filter (where t.is_active and a.id is null),
        'inactive', count(*) filter (where not t.is_active))
      from trays t left join tray_assignments a on a.tray_id = t.id and a.released_at is null
      where t.laboratory_id = p_lab),
    'cases', (
      select jsonb_build_object(
        'active', count(*) filter (where lifecycle = 'active'),
        'due_soon', count(*) filter (where lifecycle = 'active' and due_date between v_today and v_today + v_soon),
        'overdue', count(*) filter (where lifecycle = 'active' and due_date < v_today),
        'awaiting_delivery', count(*) filter (where lifecycle = 'completed'),
        'completed_this_month', count(*) filter (where completed_at is not null and local_date(completed_at, v_tz) >= v_month_start),
        'delivered_this_month', count(*) filter (where delivered_at is not null and local_date(delivered_at, v_tz) >= v_month_start),
        'completed_awaiting_tray_release', (
          select count(*) from tray_assignments a join cases c2 on c2.id = a.case_id
          where a.laboratory_id = p_lab and a.released_at is null and c2.lifecycle in ('completed', 'delivered', 'cancelled')))
      from cases where laboratory_id = p_lab and archived_at is null),
    'deadlines', coalesce((
      select jsonb_agg(d order by d->>'due_date', d->>'reference') from (
        select jsonb_build_object('id', c.id, 'reference', c.reference, 'due_date', c.due_date, 'priority', c.priority,
          'stage', s.name, 'technician', t.full_name, 'tray_number', tr.number, 'category', cat.name,
          'days_left', c.due_date - v_today) d
        from cases c
        join production_stages s on s.id = c.stage_id
        join prosthetic_categories cat on cat.id = c.category_id
        left join technicians t on t.id = c.technician_id
        left join tray_assignments a on a.case_id = c.id and a.released_at is null
        left join trays tr on tr.id = a.tray_id
        where c.laboratory_id = p_lab and c.lifecycle = 'active' and c.archived_at is null
        order by c.due_date, c.reference limit 8) x), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(x order by (x->>'created_at') desc) from (
        select jsonb_build_object('id', l.id, 'action', l.action, 'summary', l.summary, 'case_id', l.case_id,
          'created_at', l.created_at, 'actor', p.full_name) x
        from activity_logs l left join profiles p on p.id = l.actor_id
        where l.laboratory_id = p_lab order by l.created_at desc limit 12) y), '[]'::jsonb),
    'completions_by_week', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', w.wk, 'completed', coalesce(n.cnt, 0)) order by w.wk)
      from generate_series(date_trunc('week', v_today)::date - 7 * 7, date_trunc('week', v_today)::date, interval '7 days') w(wk)
      left join (
        select date_trunc('week', local_date(completed_at, v_tz))::date wk, count(*) cnt
        from cases where laboratory_id = p_lab and completed_at is not null group by 1) n on n.wk = w.wk::date), '[]'::jsonb),
    'workload', coalesce((
      select jsonb_agg(jsonb_build_object('technician_id', t.id, 'name', t.full_name,
          'active', w.active, 'due_soon', w.due_soon, 'overdue', w.overdue) order by w.active desc, t.full_name)
      from technicians t
      cross join lateral (
        select count(*) filter (where c.lifecycle = 'active') active,
               count(*) filter (where c.lifecycle = 'active' and c.due_date between v_today and v_today + v_soon) due_soon,
               count(*) filter (where c.lifecycle = 'active' and c.due_date < v_today) overdue
        from cases c where c.technician_id = t.id and c.archived_at is null) w
      where t.laboratory_id = p_lab and t.is_active), '[]'::jsonb),
    'unassigned_active', (select count(*) from cases where laboratory_id = p_lab and lifecycle = 'active' and technician_id is null and archived_at is null)
  ) into result;

  if v_admin then
    result := result || jsonb_build_object('finance', (
      select jsonb_build_object(
        'period_start', v_month_start,
        'billed_sales', coalesce((select sum(l.amount) from invoice_lines l join invoices i on i.id = l.invoice_id
            where i.laboratory_id = p_lab and i.status = 'issued' and not l.voided and i.issue_date >= v_month_start), 0),
        'payments_received', coalesce((select sum(amount) from payments where laboratory_id = p_lab and payment_date >= v_month_start), 0),
        'outstanding_receivables', coalesce((select sum(outstanding) from invoice_balances where laboratory_id = p_lab and status = 'issued'), 0),
        'currency', (select currency from laboratories where id = p_lab))));
  end if;
  return result;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Production analytics (all members; labor hours only for cost managers)
-- ─────────────────────────────────────────────────────────────
create or replace function public.production_analytics(p_lab uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_costs boolean;
begin
  perform assert_member(p_lab);
  if p_from > p_to then raise exception 'Start date must be before end date'; end if;
  v_costs := can_manage_costs(p_lab);
  select timezone into v_tz from laboratories where id = p_lab;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'definitions', jsonb_build_object(
      'occupancy_rate', 'Occupied active trays ÷ active trays, right now',
      'avg_production_days', 'Mean calendar days from date received to completion, for cases completed in the period',
      'completion_rate', 'Of non-cancelled cases due in the period, the share completed (at any time)',
      'on_time_rate', 'Of non-cancelled cases due in the period, the share completed on or before the due date'),
    'occupancy', (
      select jsonb_build_object('active', count(*), 'occupied', count(a.id),
        'rate', case when count(*) = 0 then null else round(count(a.id)::numeric * 100 / count(*), 1) end)
      from trays t left join tray_assignments a on a.tray_id = t.id and a.released_at is null
      where t.laboratory_id = p_lab and t.is_active),
    'production_time', (
      select jsonb_build_object('cases', count(*),
        'avg_days', round(avg(local_date(completed_at, v_tz) - received_date), 1),
        'min_days', min(local_date(completed_at, v_tz) - received_date),
        'max_days', max(local_date(completed_at, v_tz) - received_date))
      from cases where laboratory_id = p_lab and completed_at is not null
        and local_date(completed_at, v_tz) between p_from and p_to),
    'completion', (
      select jsonb_build_object('population', count(*),
        'completed', count(*) filter (where completed_at is not null),
        'on_time', count(*) filter (where completed_at is not null and local_date(completed_at, v_tz) <= due_date),
        'rate', case when count(*) = 0 then null else round(count(*) filter (where completed_at is not null) * 100.0 / count(*), 1) end,
        'on_time_rate', case when count(*) = 0 then null else round(count(*) filter (where completed_at is not null and local_date(completed_at, v_tz) <= due_date) * 100.0 / count(*), 1) end)
      from cases where laboratory_id = p_lab and lifecycle <> 'cancelled' and due_date between p_from and p_to),
    'received', (select count(*) from cases where laboratory_id = p_lab and received_date between p_from and p_to),
    'completed', (select count(*) from cases where laboratory_id = p_lab and completed_at is not null and local_date(completed_at, v_tz) between p_from and p_to),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'received', (select count(*) from cases where laboratory_id = p_lab and date_trunc('month', received_date) = m),
          'completed', (select count(*) from cases where laboratory_id = p_lab and completed_at is not null and date_trunc('month', local_date(completed_at, v_tz)) = m))
        order by m)
      from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', cat.name, 'received', n) order by n desc)
      from (select category_id, count(*) n from cases where laboratory_id = p_lab and received_date between p_from and p_to group by 1) x
      join prosthetic_categories cat on cat.id = x.category_id), '[]'::jsonb),
    'by_technician', coalesce((
      select jsonb_agg(jsonb_build_object('technician_id', t.id, 'name', t.full_name,
          'active_now', (select count(*) from cases c where c.technician_id = t.id and c.lifecycle = 'active' and c.archived_at is null),
          'completed', (select count(*) from cases c where c.technician_id = t.id and c.completed_at is not null and local_date(c.completed_at, v_tz) between p_from and p_to),
          'recorded_hours', case when v_costs then (select coalesce(sum(hours), 0) from case_labor_entries e where e.technician_id = t.id and e.entry_type = 'hours' and e.work_date between p_from and p_to) end)
        order by t.full_name)
      from technicians t where t.laboratory_id = p_lab and t.is_active), '[]'::jsonb)
  );
end $$;

-- ─────────────────────────────────────────────────────────────
-- Financial analytics (administrators only)
-- ─────────────────────────────────────────────────────────────
create or replace function public.financial_analytics(p_lab uuid, p_from date, p_to date,
  p_category uuid default null, p_clinic uuid default null, p_technician uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_currency text;
  v_case_filter boolean := p_category is not null or p_technician is not null;
  v_any_filter boolean := p_category is not null or p_technician is not null or p_clinic is not null;
  v_rev numeric; v_rev_cost numeric; v_rev_cases int; v_rev_complete int; v_rev_missing_price int;
  v_gp numeric; v_opex numeric;
  r jsonb;
  v_ids uuid[];
begin
  perform assert_admin(p_lab);
  if p_from > p_to then raise exception 'Start date must be before end date'; end if;
  select timezone, currency into v_tz, v_currency from laboratories where id = p_lab;

  -- Cases in scope for case-level filters
  select coalesce(array_agg(id), '{}') into v_ids from cases where laboratory_id = p_lab
    and (p_category is null or category_id = p_category)
    and (p_clinic is null or clinic_id = p_clinic)
    and (p_technician is null or technician_id = p_technician);

  -- Recognized revenue: net selling price of cases delivered in the period (accrual, on delivery)
  select coalesce(sum(f.selling_price - f.discount_amount), 0),
         coalesce(sum(s.total_recorded) filter (where f.selling_price is not null), 0),
         count(*), count(*) filter (where s.costs_complete), count(*) filter (where f.selling_price is null)
    into v_rev, v_rev_cost, v_rev_cases, v_rev_complete, v_rev_missing_price
  from cases c
  left join case_financials f on f.case_id = c.id
  join case_cost_summary s on s.case_id = c.id
  where c.id = any (v_ids) and c.delivered_at is not null and local_date(c.delivered_at, v_tz) between p_from and p_to;

  v_gp := v_rev - v_rev_cost;
  v_opex := case when v_any_filter then null else
    coalesce((select sum(amount) from operating_expenses where laboratory_id = p_lab and expense_date between p_from and p_to), 0) end;

  r := jsonb_build_object(
    'currency', v_currency, 'from', p_from, 'to', p_to,
    'filters', jsonb_build_object('category', p_category, 'clinic', p_clinic, 'technician', p_technician),
    'policy', 'Accrual basis: revenue is recognized at the net selling price when a case is delivered.',
    'kpis', jsonb_build_object(
      'billed_sales', (
        select coalesce(sum(l.amount), 0) from invoice_lines l join invoices i on i.id = l.invoice_id
        where i.laboratory_id = p_lab and i.status = 'issued' and not l.voided and i.issue_date between p_from and p_to
          and (p_clinic is null or i.clinic_id = p_clinic)
          and (not v_case_filter or l.case_id = any (v_ids))),
      'credits_issued', (
        select coalesce(sum(cn.amount), 0) from credit_notes cn join invoices i on i.id = cn.invoice_id
        where cn.laboratory_id = p_lab and cn.issue_date between p_from and p_to and (p_clinic is null or i.clinic_id = p_clinic)),
      'recognized_revenue', v_rev,
      'recognized_cases', v_rev_cases,
      'recognized_cases_missing_price', v_rev_missing_price,
      'payments_received', case when v_case_filter then null else (
        select coalesce(sum(amount), 0) from payments where laboratory_id = p_lab and payment_date between p_from and p_to
          and (p_clinic is null or clinic_id = p_clinic)) end,
      'outstanding_receivables', (
        select coalesce(sum(outstanding), 0) from invoice_balances where laboratory_id = p_lab and status = 'issued'
          and (p_clinic is null or clinic_id = p_clinic)),
      'recorded_production_costs', (
        select coalesce(sum(x), 0) from (
          select line_total x from case_material_costs where laboratory_id = p_lab and recorded_on between p_from and p_to and case_id = any (v_ids)
          union all select amount from case_labor_entries where laboratory_id = p_lab and work_date between p_from and p_to and case_id = any (v_ids)
          union all select amount from case_other_direct_costs where laboratory_id = p_lab and cost_date between p_from and p_to and case_id = any (v_ids)) z),
      'matched_direct_cost', v_rev_cost,
      'gross_profit', v_gp,
      'gross_margin_pct', case when v_rev = 0 then null else round(v_gp * 100 / v_rev, 1) end,
      'cost_records_complete', v_rev_cases > 0 and v_rev_complete = v_rev_cases,
      'cases_with_complete_costs', v_rev_complete,
      'operating_expenses', v_opex,
      'operating_profit', case when v_opex is null then null else v_gp - v_opex end),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
          'month', to_char(m, 'YYYY-MM'),
          'billed_sales', (select coalesce(sum(l.amount), 0) from invoice_lines l join invoices i on i.id = l.invoice_id
              where i.laboratory_id = p_lab and i.status = 'issued' and not l.voided
                and date_trunc('month', i.issue_date) = m and i.issue_date between p_from and p_to
                and (p_clinic is null or i.clinic_id = p_clinic)
                and (not v_case_filter or l.case_id = any (v_ids))),
          'recognized_revenue', (select coalesce(sum(f.selling_price - f.discount_amount), 0) from cases c
               join case_financials f on f.case_id = c.id
              where c.id = any (v_ids) and c.delivered_at is not null and date_trunc('month', local_date(c.delivered_at, v_tz)) = m
                and local_date(c.delivered_at, v_tz) between p_from and p_to),
          'payments_received', case when v_case_filter then null else (select coalesce(sum(amount), 0) from payments
              where laboratory_id = p_lab and date_trunc('month', payment_date) = m and payment_date between p_from and p_to
                and (p_clinic is null or clinic_id = p_clinic)) end,
          'direct_costs', (select coalesce(sum(x), 0) from (
              select line_total x from case_material_costs where laboratory_id = p_lab and date_trunc('month', recorded_on) = m and recorded_on between p_from and p_to and case_id = any (v_ids)
              union all select amount from case_labor_entries where laboratory_id = p_lab and date_trunc('month', work_date) = m and work_date between p_from and p_to and case_id = any (v_ids)
              union all select amount from case_other_direct_costs where laboratory_id = p_lab and date_trunc('month', cost_date) = m and cost_date between p_from and p_to and case_id = any (v_ids)) z),
          'operating_expenses', case when v_any_filter then null else (select coalesce(sum(amount), 0) from operating_expenses
              where laboratory_id = p_lab and date_trunc('month', expense_date) = m and expense_date between p_from and p_to) end)
        order by m)
      from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m), '[]'::jsonb),
    'cost_distribution', (
      select jsonb_build_object(
        'materials', coalesce((select sum(line_total) from case_material_costs where laboratory_id = p_lab and recorded_on between p_from and p_to and case_id = any (v_ids)), 0),
        'labor', coalesce((select sum(amount) from case_labor_entries where laboratory_id = p_lab and work_date between p_from and p_to and case_id = any (v_ids)), 0),
        'other', coalesce((select sum(amount) from case_other_direct_costs where laboratory_id = p_lab and cost_date between p_from and p_to and case_id = any (v_ids)), 0))),
    -- Profitability by category / service: all recognized cases, plus a subset with complete cost records.
    'by_category', coalesce((
      select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (
        select jsonb_build_object('id', cat.id, 'name', cat.name,
          'cases', count(*),
          'revenue', coalesce(sum(f.selling_price - f.discount_amount), 0),
          'direct_cost', coalesce(sum(s.total_recorded), 0),
          'gross_profit', coalesce(sum(f.selling_price - f.discount_amount), 0) - coalesce(sum(s.total_recorded), 0),
          'complete_cases', count(*) filter (where s.costs_complete and f.selling_price is not null),
          'complete_revenue', coalesce(sum(f.selling_price - f.discount_amount) filter (where s.costs_complete), 0),
          'complete_direct_cost', coalesce(sum(s.total_recorded) filter (where s.costs_complete and f.selling_price is not null), 0)) x
        from cases c
        join prosthetic_categories cat on cat.id = c.category_id
        left join case_financials f on f.case_id = c.id
        join case_cost_summary s on s.case_id = c.id
        where c.id = any (v_ids) and c.delivered_at is not null and local_date(c.delivered_at, v_tz) between p_from and p_to
        group by cat.id, cat.name) y), '[]'::jsonb),
    'by_service', coalesce((
      select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (
        select jsonb_build_object('id', sv.id, 'name', coalesce(sv.name, 'No service set'),
          'cases', count(*),
          'revenue', coalesce(sum(f.selling_price - f.discount_amount), 0),
          'direct_cost', coalesce(sum(s.total_recorded), 0),
          'complete_cases', count(*) filter (where s.costs_complete and f.selling_price is not null),
          'complete_revenue', coalesce(sum(f.selling_price - f.discount_amount) filter (where s.costs_complete), 0),
          'complete_direct_cost', coalesce(sum(s.total_recorded) filter (where s.costs_complete and f.selling_price is not null), 0)) x
        from cases c
        left join services sv on sv.id = c.service_id
        left join case_financials f on f.case_id = c.id
        join case_cost_summary s on s.case_id = c.id
        where c.id = any (v_ids) and c.delivered_at is not null and local_date(c.delivered_at, v_tz) between p_from and p_to
        group by sv.id, sv.name) y), '[]'::jsonb),
    'incomplete_cost_cases', coalesce((
      select jsonb_agg(x order by x->>'reference') from (
        select jsonb_build_object('id', c.id, 'reference', c.reference, 'lifecycle', c.lifecycle,
          'materials', case when s.materials_confirmed then 'confirmed' when s.material_entries > 0 then 'incomplete' else 'missing' end,
          'labor', case when s.labor_confirmed then 'confirmed' when s.labor_entries > 0 then 'incomplete' else 'missing' end,
          'other', case when s.other_costs_confirmed then 'confirmed' when s.other_entries > 0 then 'incomplete' else 'missing' end,
          'estimates', s.estimate_entries) x
        from cases c
        join case_cost_summary s on s.case_id = c.id
        where c.id = any (v_ids) and not s.costs_complete and c.lifecycle in ('completed', 'delivered') and c.archived_at is null
        limit 50) y), '[]'::jsonb)
  );
  return r;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Global search (SECURITY INVOKER: RLS decides what each user can find)
-- ─────────────────────────────────────────────────────────────
create or replace function public.global_search(p_lab uuid, p_q text) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  q text := '%' || replace(replace(replace(trim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_num int := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '')::int;
begin
  if length(trim(coalesce(p_q, ''))) < 1 then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'cases', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', c.id, 'reference', c.reference, 'lifecycle', c.lifecycle, 'due_date', c.due_date,
                                'patient', p.reference, 'archived', c.archived_at is not null) x
      from cases c left join patients p on p.id = c.patient_id
      where c.laboratory_id = p_lab and (c.reference ilike q or p.reference ilike q or p.full_name ilike q)
      order by c.archived_at nulls first, c.due_date desc limit 8) y), '[]'::jsonb),
    'trays', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', tray_id, 'number', number, 'case_reference', case_reference, 'is_active', is_active) x
      from tray_board where laboratory_id = p_lab and (number = v_num or label ilike q or case_reference ilike q)
      order by number limit 6) y), '[]'::jsonb),
    'patients', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', id, 'reference', reference, 'full_name', full_name) x
      from patients where laboratory_id = p_lab and (reference ilike q or full_name ilike q) order by reference limit 6) y), '[]'::jsonb),
    'clinics', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', id, 'name', name) x
      from clinics where laboratory_id = p_lab and name ilike q order by name limit 6) y), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', id, 'name', name) x
      from services where laboratory_id = p_lab and name ilike q order by name limit 6) y), '[]'::jsonb)
  );
end $$;
