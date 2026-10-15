-- JSON numbers lose decimal precision when parsed in JavaScript (binary floating point).
-- Analytics functions therefore emit monetary values as decimal strings. This helper walks a
-- jsonb document and converts the numbers stored under monetary keys into exact strings.
create or replace function public.money_as_text(j jsonb) returns jsonb
language sql immutable as $$
  select case jsonb_typeof(j)
    when 'object' then coalesce((
      select jsonb_object_agg(k, case
        when jsonb_typeof(v) = 'number' and k = any (array[
          'billed_sales', 'credits_issued', 'recognized_revenue', 'payments_received', 'outstanding_receivables',
          'recorded_production_costs', 'matched_direct_cost', 'gross_profit', 'gross_margin_pct', 'operating_expenses',
          'operating_profit', 'direct_costs', 'materials', 'labor', 'other', 'revenue', 'direct_cost',
          'complete_revenue', 'complete_direct_cost'])
          then to_jsonb(v #>> '{}')
        else public.money_as_text(v) end)
      from jsonb_each(j) as e(k, v)), '{}'::jsonb)
    when 'array' then coalesce((select jsonb_agg(public.money_as_text(x) order by i) from jsonb_array_elements(j) with ordinality as a(x, i)), '[]'::jsonb)
    else j end
$$;

-- Wrap the analytics functions so callers always receive exact decimal strings.
alter function public.financial_analytics(uuid, date, date, uuid, uuid, uuid) rename to financial_analytics_raw;
create or replace function public.financial_analytics(p_lab uuid, p_from date, p_to date,
  p_category uuid default null, p_clinic uuid default null, p_technician uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select money_as_text(financial_analytics_raw(p_lab, p_from, p_to, p_category, p_clinic, p_technician))
$$;

alter function public.dashboard_overview(uuid) rename to dashboard_overview_raw;
create or replace function public.dashboard_overview(p_lab uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select money_as_text(dashboard_overview_raw(p_lab))
$$;

revoke execute on function public.financial_analytics_raw(uuid, date, date, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.dashboard_overview_raw(uuid) from public, anon, authenticated;

-- Labor rates are cost data: only callable from inside permission-checked functions.
revoke execute on function public.labor_rate_for(uuid, uuid, date) from public, anon, authenticated;
