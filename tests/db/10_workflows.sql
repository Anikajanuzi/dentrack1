-- End-to-end database tests for DENTRACK's critical rules.
-- Run: scripts/test-db.sh   (creates a fresh database, applies migrations, runs every tests/db/*.sql)
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create table test.ids (k text primary key, v uuid);
grant all on test.ids to authenticated;
create or replace function test.id(p text) returns uuid language sql stable as $$ select v from test.ids where k = p $$;
grant execute on function test.id(text) to authenticated;
create or replace function test.login(p_name text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', test.uid(p_name), 'role', 'authenticated')::text, false)
$$;
\set as_admin 'reset role; select test.login(''admin''); set role authenticated;'
\set as_tech 'reset role; select test.login(''tech''); set role authenticated;'
\set as_tech2 'reset role; select test.login(''tech2''); set role authenticated;'
\set as_outsider 'reset role; select test.login(''outsider''); set role authenticated;'

-- ── Users ───────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  (test.uid('admin'), 'owner@lab-a.test', '{"full_name":"Ana Owner"}'),
  (test.uid('outsider'), 'owner@lab-b.test', '{"full_name":"Other Owner"}');

:as_admin
insert into test.ids values ('lab', create_laboratory('Lab A', 'Europe/Budapest', 'EUR', 6));
select test.eq((select count(*) from trays where laboratory_id = test.id('lab'))::int, 6, 'lab created with 6 trays');
select test.eq((select count(*) from production_stages where laboratory_id = test.id('lab'))::int, 5, 'default stages');
select test.eq((select count(*) from service_prices where laboratory_id = test.id('lab'))::int, 0, 'no invented prices');

-- invite technicians, then they sign up (trigger accepts invitation)
insert into lab_invitations (laboratory_id, email, role) values (test.id('lab'), 'tech@lab-a.test', 'technician');
insert into lab_invitations (laboratory_id, email, role, can_manage_costs) values (test.id('lab'), 'tech2@lab-a.test', 'technician', true);
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (test.uid('tech'), 'tech@lab-a.test', '{"full_name":"Tom Tech"}'),
  (test.uid('tech2'), 'tech2@lab-a.test', '{"full_name":"Tara Tech"}');
insert into test.ids select 'tech', id from technicians where user_id = test.uid('tech');
insert into test.ids select 'tech2', id from technicians where user_id = test.uid('tech2');
select test.eq((select role::text from laboratory_memberships where user_id = test.uid('tech')), 'technician', 'invitation accepted on sign-up');

:as_outsider
insert into test.ids values ('labB', create_laboratory('Lab B', 'UTC', 'EUR', 2));

-- ── Reference data (admin) ──────────────────────────────────
:as_admin
with x as (insert into clinics (laboratory_id, name) values (test.id('lab'), 'Smile Clinic') returning id) insert into test.ids select 'clinic', id from x;
with x as (insert into clinics (laboratory_id, name) values (test.id('lab'), 'North Dental') returning id) insert into test.ids select 'clinic2', id from x;
insert into test.ids select 'zirc', id from prosthetic_categories where laboratory_id = test.id('lab') and name = 'Zirconia crowns';
with x as (insert into services (laboratory_id, category_id, name) values (test.id('lab'), test.id('zirc'), 'Monolithic zirconia crown') returning id) insert into test.ids select 'svc', id from x;
insert into service_prices (laboratory_id, service_id, price, effective_from) values (test.id('lab'), test.id('svc'), 120.00, '2026-01-01');
with x as (insert into material_catalog (laboratory_id, name, unit, default_unit_cost) values (test.id('lab'), 'Zirconia block', 'block', 33.00) returning id) insert into test.ids select 'mat', id from x;
insert into labor_rates (laboratory_id, technician_id, hourly_rate, effective_from) values (test.id('lab'), null, 8.00, '2026-01-01');
insert into test.ids select 'tray1', id from trays where laboratory_id = test.id('lab') and number = 1;
insert into test.ids select 'tray2', id from trays where laboratory_id = test.id('lab') and number = 2;
insert into test.ids select 'trayB', id from trays where laboratory_id = test.id('labB') and number = 1;
select test.eq(test.id('trayB'), null::uuid, 'admin of lab A cannot see lab B trays');
reset role; insert into test.ids select 'trayB2', id from trays where laboratory_id = test.id('labB') and number = 1;

-- ── Case creation with tray assignment ──────────────────────
:as_admin
insert into test.ids values ('case1', create_case(test.id('lab'), jsonb_build_object(
  'patient_reference', 'P-0001', 'patient_name', 'Jane Patient', 'clinic_id', test.id('clinic'),
  'category_id', test.id('zirc'), 'service_id', test.id('svc'), 'technician_id', test.id('tech'),
  'received_date', '2026-10-01', 'due_date', '2026-10-20', 'tray_id', test.id('tray1'), 'discount_amount', 10)));
select test.eq((select reference from cases where id = test.id('case1')), 'C-2026-0001', 'case reference auto-generated');
select test.eq((select selling_price from case_financials where case_id = test.id('case1')), 120.00::numeric, 'price snapshotted from price list');
select test.eq((select price_source from case_financials where case_id = test.id('case1')), 'price_list', 'price source recorded');
select test.eq((select case_id from tray_board where tray_id = test.id('tray1')), test.id('case1'), 'tray 1 occupied by case 1');

insert into test.ids values ('case2', create_case(test.id('lab'), jsonb_build_object(
  'patient_reference', 'P-0002', 'clinic_id', test.id('clinic'), 'category_id', test.id('zirc'),
  'technician_id', test.id('tech2'), 'received_date', '2026-10-02', 'due_date', '2026-10-10')));

-- no double occupancy, no case in two trays
select test.throws(format('select assign_tray(%L, %L)', test.id('tray1'), test.id('case2')), 'already occupied');
select test.throws(format('select assign_tray(%L, %L)', test.id('tray2'), test.id('case1')), 'already in another tray');
reset role;
select test.throws(format('insert into tray_assignments (laboratory_id, tray_id, case_id) values (%L, %L, %L)',
  test.id('lab'), test.id('tray1'), test.id('case2')), 'tray_one_active_case');
-- cross-lab: tray from lab B cannot hold a lab A case
:as_admin
select test.throws(format('select assign_tray(%L, %L)', test.id('trayB2'), test.id('case1')), 'not a member|different laboratories');
-- validation
select test.throws(format('select create_case(%L, %L::jsonb)', test.id('lab'),
  jsonb_build_object('patient_reference','X','clinic_id',test.id('clinic'),'category_id',test.id('zirc'),'received_date','2026-10-05','due_date','2026-10-01')), 'before the date received');
select test.throws(format('select create_case(%L, %L::jsonb)', test.id('lab'),
  jsonb_build_object('patient_reference','X','clinic_id',test.id('clinic'),'category_id',test.id('svc'),'due_date','2026-12-01')), 'Category not found');

-- ── Technician permissions & data minimization ──────────────
:as_tech
select test.eq((select count(*) from cases where laboratory_id = test.id('lab'))::int, 2, 'technician sees operational cases');
select test.eq((select count(*) from case_financials)::int, 0, 'technician cannot read prices');
select test.eq((select count(*) from patients)::int, 1, 'technician sees only own-case patients');
select test.eq((select count(*) from invoices)::int, 0, 'technician cannot read invoices');
select test.eq((select count(*) from case_material_costs)::int, 0, 'technician without grant cannot read costs');
select test.throws(format('select financial_analytics(%L, %L, %L)', test.id('lab'), '2026-01-01', '2026-12-31'), 'Administrator permission');
select test.throws(format('select add_material_cost(%L, %L, null, null, 1, null)', test.id('case1'), test.id('mat')), 'Cost recording permission');
select test.throws(format('select create_case(%L, %L::jsonb)', test.id('lab'),
  jsonb_build_object('patient_reference','P-9','clinic_id',test.id('clinic'),'category_id',test.id('zirc'),'due_date','2026-12-01','selling_price',50)), 'Only administrators can set prices');
update case_financials set selling_price = 1 where case_id = test.id('case1'); -- silently matches 0 rows under RLS
select test.throws(format('select move_case_stage(%L, (select id from production_stages where laboratory_id = %L and name = %L))',
  test.id('case2'), test.id('lab'), 'In Production'), 'assigned technician');
select move_case_stage(test.id('case1'), (select id from production_stages where laboratory_id = test.id('lab') and name = 'In Production'), 'Started milling');
select test.throws(format('select update_case(%L, %L::jsonb)', test.id('case1'), '{"due_date":"2026-12-31"}'), 'only edit notes');
select update_case(test.id('case1'), '{"shade":"A2"}');
select test.throws('update laboratory_memberships set role = ''admin'' where user_id = test.uid(''tech'')', 'Only administrators');
reset role;
select test.eq((select selling_price from case_financials where case_id = test.id('case1')), 120.00::numeric, 'technician could not change price');
select test.eq((select count(*) from notifications where user_id = test.uid('tech') and type = 'assignment')::int, 1, 'assignee notified of new case');

-- ── Outsider isolation ──────────────────────────────────────
:as_outsider
select test.eq((select count(*) from cases where laboratory_id = test.id('lab'))::int, 0, 'other lab cannot read cases');
select test.eq((select count(*) from activity_logs where laboratory_id = test.id('lab'))::int, 0, 'other lab cannot read activity');
select test.throws(format('select release_tray(%L, true)', test.id('tray1')), 'Not a member');
select test.throws(format('select dashboard_overview(%L)', test.id('lab')), 'Not a member');
select test.eq((global_search(test.id('lab'), 'C-2026') -> 'cases')::text, '[]', 'search respects RLS');

-- ── Direct cost breakdown (spec example) ────────────────────
:as_tech2
-- tech2 has the explicit cost permission
select add_material_cost(test.id('case1'), test.id('mat'), null, null, 0.5, null);                         -- 0.5 × 33.00 = 16.50
select add_labor_entry(test.id('case1'), test.id('tech'), 'Design & milling', 'hours', 1.5);              -- 1.5 × 8 = 12.00
select add_labor_entry(test.id('case1'), test.id('tech2'), 'Sintering & glaze', 'hours', 1);              -- 1 × 8 = 8.00
insert into case_other_direct_costs (laboratory_id, case_id, category, description, amount, created_by)
  values (test.id('lab'), test.id('case1'), 'external_scanning', 'Partner scan', 8.00, auth.uid());
select test.throws(format('select add_labor_entry(%L, %L, %L, %L, 1, null, 99)', test.id('case1'), test.id('tech'), 'x', 'hours'), 'Only administrators can override');
select test.throws(format('select add_material_cost(%L, null, %L, %L, 2, null)', test.id('case1'), 'Wax', 'g'), 'No unit cost recorded');
select test.eq((select material_total from case_cost_summary where case_id = test.id('case1')), 16.50::numeric, 'material total');
select test.eq((select labor_total from case_cost_summary where case_id = test.id('case1')), 20.00::numeric, 'labor total');
select test.eq((select other_total from case_cost_summary where case_id = test.id('case1')), 8.00::numeric, 'other direct total');
select test.eq((select total_recorded from case_cost_summary where case_id = test.id('case1')), 44.50::numeric, 'total direct cost 44.50');
select test.eq((select costs_complete from case_cost_summary where case_id = test.id('case1')), false, 'unconfirmed sections are not complete');
select test.eq((select material_entries from case_cost_summary where case_id = test.id('case2')), 0, 'missing costs stay distinguishable (0 entries, unconfirmed)');

-- historical cost preserved when catalog price changes
:as_admin
update material_catalog set default_unit_cost = 40.00 where id = test.id('mat');
select test.eq((select unit_cost from case_material_costs where case_id = test.id('case1')), 33.0000::numeric, 'recorded cost unaffected by catalog change');
select test.eq((select count(*) from financial_audit_log where table_name = 'material_catalog' and action = 'UPDATE')::int, 1, 'catalog change audited');
-- labor rate history: a new rate applies only from its effective date
insert into labor_rates (laboratory_id, technician_id, hourly_rate, effective_from) values (test.id('lab'), null, 10.00, '2026-11-01');
select test.throws(format('select labor_rate_for(%L, %L, %L)', test.id('lab'), test.id('tech'), '2026-10-15'), 'permission denied');
reset role;
select test.eq(labor_rate_for(test.id('lab'), test.id('tech'), '2026-10-15'), 8.00::numeric, 'old rate before effective date');
select test.eq(labor_rate_for(test.id('lab'), test.id('tech'), '2026-11-02'), 10.00::numeric, 'new rate after effective date');
:as_admin

-- ── Completion does NOT release the tray ────────────────────
select move_case_stage(test.id('case1'), (select id from production_stages where laboratory_id = test.id('lab') and system_key = 'completed'));
select test.eq((select lifecycle::text from cases where id = test.id('case1')), 'completed', 'case completed');
select test.eq((select case_id from tray_board where tray_id = test.id('tray1')), test.id('case1'), 'tray still occupied after completion');
select test.throws(format('select release_tray(%L, false)', test.id('tray1')), 'physically empty');
select test.throws(format('select archive_case(%L)', test.id('case1')), 'Only delivered or cancelled');
select release_tray(test.id('tray1'), true);
select test.eq((select case_id from tray_board where tray_id = test.id('tray1')), null::uuid, 'tray available after confirmed release');
select test.eq((select count(*) from tray_assignments where case_id = test.id('case1'))::int, 1, 'assignment history preserved');
select test.throws(format('select release_tray(%L, true)', test.id('tray1')), 'already available');
-- releasing an in-production case requires a reason
select assign_tray(test.id('tray2'), test.id('case2'));
select test.throws(format('select release_tray(%L, true)', test.id('tray2')), 'Give a reason');
select move_case_to_tray(test.id('case2'), test.id('tray1'), true);
select test.eq((select case_id from tray_board where tray_id = test.id('tray1')), test.id('case2'), 'case moved to tray 1');
select test.eq((select case_id from tray_board where tray_id = test.id('tray2')), null::uuid, 'old tray freed by move');
select test.throws(format('select set_tray_active(%L, false)', test.id('tray1')), 'occupied');

-- ── Delivery, invoicing, payments ───────────────────────────
select move_case_stage(test.id('case1'), (select id from production_stages where laboratory_id = test.id('lab') and system_key = 'delivered'));
update cases set delivered_at = '2026-10-12 10:00+02' where id = test.id('case1'); -- pin date for analytics
insert into test.ids values ('inv', create_invoice(test.id('lab'), test.id('clinic'), array[test.id('case1')], '[]', true, '2026-10-12', '2026-11-12'));
select test.eq((select total from invoice_balances where invoice_id = test.id('inv')), 110.00::numeric, 'invoice uses net price 120 − 10');
select test.throws(format('select create_invoice(%L, %L, array[%L]::uuid[], %L, true)', test.id('lab'), test.id('clinic'), test.id('case1'), '[]'), 'already invoiced');
select test.throws(format('select create_invoice(%L, %L, array[%L]::uuid[], %L, true)', test.id('lab'), test.id('clinic2'), test.id('case2'), '[]'), 'different clinic|no selling price');
select test.throws(format('select update_case_pricing(%L, 200, 0, null)', test.id('case1')), 'already invoiced');

insert into test.ids values ('pay', record_payment(test.id('lab'), test.id('clinic'), 50, '2026-10-13', 'bank_transfer', 'TRX-1',
  '11111111-1111-1111-1111-111111111111', jsonb_build_array(jsonb_build_object('invoice_id', test.id('inv'), 'amount', 50))));
select test.eq(record_payment(test.id('lab'), test.id('clinic'), 50, '2026-10-13', 'bank_transfer', 'TRX-1',
  '11111111-1111-1111-1111-111111111111', jsonb_build_array(jsonb_build_object('invoice_id', test.id('inv'), 'amount', 50))), test.id('pay'), 'duplicate submit returns same payment');
select test.eq((select count(*) from payments where laboratory_id = test.id('lab'))::int, 1, 'no duplicate payment');
select test.eq((select outstanding from invoice_balances where invoice_id = test.id('inv')), 60.00::numeric, 'partial payment outstanding');
select test.eq((select payment_status from invoice_balances where invoice_id = test.id('inv')), 'partially_paid', 'partially paid status');
select test.throws(format('select record_payment(%L, %L, 100, %L, %L, null, gen_random_uuid(), %L::jsonb)', test.id('lab'), test.id('clinic'), '2026-10-14', 'cash',
  jsonb_build_array(jsonb_build_object('invoice_id', test.id('inv'), 'amount', 61))), 'exceeds the outstanding');
select test.throws(format('select void_invoice(%L, %L)', test.id('inv'), 'mistake'), 'has payments');
select add_credit_note(test.id('inv'), 10, 'Shade adjustment goodwill', '2026-10-14');
select test.eq((select outstanding from invoice_balances where invoice_id = test.id('inv')), 50.00::numeric, 'credit reduces outstanding (110 − 50 − 10)');
delete from payments where id = test.id('pay'); -- no delete policy: RLS matches 0 rows
select test.eq((select count(*) from payments where id = test.id('pay'))::int, 1, 'payments cannot be deleted via API');
reset role;
select test.throws(format('delete from payments where id = %L', test.id('pay')), 'cannot be modified');
:as_admin
-- unapplied payment, allocated later
insert into test.ids values ('pay2', record_payment(test.id('lab'), test.id('clinic'), 70, '2026-10-14', 'cash', null, gen_random_uuid(), '[]'));
select test.throws(format('select allocate_payment(%L, %L, 60)', test.id('pay2'), test.id('inv')), 'exceeds the outstanding');
select allocate_payment(test.id('pay2'), test.id('inv'), 50);
select test.eq((select payment_status from invoice_balances where invoice_id = test.id('inv')), 'paid', 'fully paid');
select test.throws(format('select allocate_payment(%L, %L, 30)', test.id('pay2'), test.id('inv')), 'unapplied');

-- ── Financial analytics ─────────────────────────────────────
select set_cost_section_confirmed(test.id('case1'), 'materials', true);
select set_cost_section_confirmed(test.id('case1'), 'labor', true);
insert into operating_expenses (laboratory_id, category, description, amount, expense_date) values (test.id('lab'), 'rent', 'October rent', 40.00, '2026-10-01');
insert into test.ids values ('fa', null);
create temp table fa as select financial_analytics(test.id('lab'), '2026-10-01', '2026-10-31') j;
select test.eq((select (j->'kpis'->>'billed_sales')::numeric from fa), 110.00::numeric, 'billed sales');
select test.eq((select (j->'kpis'->>'recognized_revenue')::numeric from fa), 110.00::numeric, 'recognized revenue (delivered)');
select test.eq((select (j->'kpis'->>'payments_received')::numeric from fa), 120.00::numeric, 'payments received (incl. unapplied cash)');
select test.eq((select (j->'kpis'->>'outstanding_receivables')::numeric from fa), 0.00::numeric, 'receivables');
select test.eq((select (j->'kpis'->>'matched_direct_cost')::numeric from fa), 44.50::numeric, 'matched direct cost');
select test.eq((select (j->'kpis'->>'gross_profit')::numeric from fa), 65.50::numeric, 'gross profit 110 − 44.50');
select test.eq((select (j->'kpis'->>'gross_margin_pct')::numeric from fa), 59.5::numeric, 'gross margin 59.5%');
select test.eq((select (j->'kpis'->>'cost_records_complete')::boolean from fa), false, 'other costs unconfirmed → incomplete');
select test.eq((select (j->'kpis'->>'operating_expenses')::numeric from fa), 40.00::numeric, 'operating expenses');
select test.eq((select (j->'kpis'->>'operating_profit')::numeric from fa), 25.50::numeric, 'operating profit 65.50 − 40');
select test.eq((select (j->'cost_distribution'->>'labor')::numeric from fa), 20.00::numeric, 'cost distribution labor');
select test.eq((select jsonb_array_length(j->'incomplete_cost_cases') from fa), 1, 'incomplete cost case listed');
select test.eq((select jsonb_typeof(j->'kpis'->'gross_profit') from fa), 'string', 'money is emitted as an exact decimal string');
drop table fa;
create temp table fa as select financial_analytics(test.id('lab'), '2026-10-01', '2026-10-31', test.id('zirc')) j;
select test.eq((select j->'kpis'->'operating_profit' from fa), 'null'::jsonb, 'operating profit not computed for filtered view');
select test.eq((select j->'kpis'->'payments_received' from fa), 'null'::jsonb, 'payments not attributable to a category');
drop table fa;
select set_cost_section_confirmed(test.id('case1'), 'other', true);
select test.eq((select (financial_analytics(test.id('lab'), '2026-10-01', '2026-10-31')->'kpis'->>'cost_records_complete')::boolean), true, 'complete after all sections confirmed');
select test.eq((select (financial_analytics(test.id('lab'), '2026-09-01', '2026-09-30')->'kpis'->>'recognized_revenue')::numeric), 0::numeric, 'other period excludes October revenue');

-- ── Archive keeps history, no double counting ───────────────
select archive_case(test.id('case1'));
select test.eq((select (financial_analytics(test.id('lab'), '2026-10-01', '2026-10-31')->'kpis'->>'recognized_revenue')::numeric), 110.00::numeric, 'archived case revenue still counted once');
select test.throws(format('select move_case_stage(%L, (select id from production_stages where laboratory_id = %L and system_key = %L))', test.id('case1'), test.id('lab'), 'received'), 'Archived');
select restore_case(test.id('case1'));

-- ── Dashboard & notifications ───────────────────────────────
select test.eq((dashboard_overview(test.id('lab'))->'trays'->>'occupied')::int, 1, 'dashboard occupied trays');
select test.eq((dashboard_overview(test.id('lab'))->'trays'->>'available')::int, 5, 'dashboard available trays');
reset role;
update cases set due_date = lab_today(laboratory_id) - 1, received_date = lab_today(laboratory_id) - 5 where id = test.id('case2');
:as_admin
select test.eq((dashboard_overview(test.id('lab'))->'cases'->>'overdue')::int, 1, 'overdue uses lab-local date');
select generate_deadline_notifications(test.id('lab'));
select test.eq(generate_deadline_notifications(test.id('lab')), 0, 'deadline notifications are idempotent');
select test.eq((select count(*) from notifications where type = 'overdue')::int, 1, 'admin got one overdue notice');
select mark_notifications_read(null);
select test.eq((select count(*) from notifications where read_at is null)::int, 0, 'mark all read');
:as_tech
select test.eq((select count(*) from notifications where type = 'overdue')::int, 0, 'tech1 not notified about tech2 case');
select test.eq((production_analytics(test.id('lab'), '2026-10-01', '2026-10-31')->'by_technician'->0->'recorded_hours'), 'null'::jsonb, 'labor hours hidden from non-cost users');

reset role;
\echo ALL DATABASE TESTS PASSED
