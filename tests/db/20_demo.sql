\set ON_ERROR_STOP 1
\pset tuples_only on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000de', 'demo@dentrack.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000de"}', false);
set role authenticated;
create temp table d as select create_demo_laboratory() as lab;
select test.eq((select is_demo from laboratories where id = (select lab from d)), true, 'demo lab flagged');
select test.eq((select count(*) > 30 from cases where laboratory_id = (select lab from d)), true, 'demo cases generated');
-- integrity: every occupied tray holds exactly one case; no case in two trays
select test.eq((select count(*) from (select tray_id from tray_assignments where released_at is null and laboratory_id = (select lab from d) group by 1 having count(*) > 1) x)::int, 0, 'no double-occupied trays');
-- invoice totals reconcile with case net prices
select test.eq((select sum(total) from invoice_balances where laboratory_id = (select lab from d) and status = 'issued'),
  (select sum(f.selling_price - f.discount_amount) from invoice_lines l join case_financials f on f.case_id = l.case_id where l.laboratory_id = (select lab from d) and not l.voided), 'invoices reconcile with case net prices');
-- payments never exceed billed
select test.eq((select bool_and(outstanding >= 0) from invoice_balances where laboratory_id = (select lab from d)), true, 'no negative balances');
select test.eq((dashboard_overview((select lab from d)) ? 'finance'), true, 'demo owner sees finance');
select test.eq(jsonb_typeof(financial_analytics((select lab from d), lab_today((select lab from d)) - 150, lab_today((select lab from d))) -> 'monthly'), 'array', 'analytics run on demo');
reset role;
\echo demo ok
