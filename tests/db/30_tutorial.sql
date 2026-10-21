-- Migration 0008: tutorial progress is private per user and per laboratory.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create or replace function test.login8(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false)
$$;
create table if not exists test.t8 (k text primary key, v uuid);
grant all on test.t8 to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000008a1', 'tour-a@test.example'),
  ('00000000-0000-0000-0000-0000000008b2', 'tour-b@test.example');

-- user A creates a laboratory and saves progress
select test.login8('00000000-0000-0000-0000-0000000008a1'); set role authenticated;
insert into test.t8 values ('lab', create_laboratory('Tour Lab', 'UTC', 'EUR', 0));
insert into tutorial_progress (user_id, laboratory_id, status, step)
  values ('00000000-0000-0000-0000-0000000008a1', (select v from test.t8 where k = 'lab'), 'in_progress', 2);
update tutorial_progress set status = 'completed', step = 5 where laboratory_id = (select v from test.t8 where k = 'lab');
select test.eq((select status from tutorial_progress), 'completed', 'owner reads and updates own progress');

-- user B (not a member) sees nothing and can't write rows for A or for A's laboratory
reset role; select test.login8('00000000-0000-0000-0000-0000000008b2'); set role authenticated;
select test.eq((select count(*) from tutorial_progress)::int, 0, 'other users see no progress rows');
select test.throws($$insert into tutorial_progress (user_id, laboratory_id) values ('00000000-0000-0000-0000-0000000008a1', (select v from test.t8 where k = 'lab'))$$, 'row-level security');
select test.throws($$insert into tutorial_progress (user_id, laboratory_id) values ('00000000-0000-0000-0000-0000000008b2', (select v from test.t8 where k = 'lab'))$$, 'row-level security');
update tutorial_progress set status = 'skipped';
reset role;
select test.eq((select status from tutorial_progress where user_id = '00000000-0000-0000-0000-0000000008a1'), 'completed', 'other users cannot change it');

-- invalid status rejected
select test.throws($$update tutorial_progress set status = 'bogus'$$, 'check constraint');

-- lab and tray creation in one transaction is atomic: a failing tray range leaves no laboratory behind
select test.login8('00000000-0000-0000-0000-0000000008b2'); set role authenticated;
do $$
declare v uuid;
begin
  begin
    v := create_laboratory('Half Lab', 'UTC', 'EUR', 0);
    perform add_trays(v, 9990, 10009);   -- beyond 9999: raises
  exception when others then null;       -- the whole block is rolled back to here
  end;
end $$;
select test.eq((select count(*) from laboratories where name = 'Half Lab')::int, 0, 'failed tray creation leaves no laboratory');
reset role;
select test.eq((select count(*) from laboratory_memberships m join laboratories l on l.id = m.laboratory_id where l.name = 'Half Lab')::int, 0, 'and no membership');

-- deleting the laboratory removes its progress rows
delete from laboratories where id = (select v from test.t8 where k = 'lab');
select test.eq((select count(*) from tutorial_progress)::int, 0, 'progress removed with its laboratory');
