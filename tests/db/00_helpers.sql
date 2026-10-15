-- Test helpers (loaded into the throwaway test database only).
create schema if not exists test;
grant usage on schema test to authenticated;

-- Expect a statement to fail with a message matching a pattern.
create or replace function test.throws(p_sql text, p_pattern text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pattern then
      raise exception 'Expected error matching "%" but got: %', p_pattern, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected error matching "%" but statement succeeded: %', p_pattern, p_sql;
end $$;
grant execute on function test.throws(text, text) to authenticated;

create or replace function test.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok - %', p_label;
end $$;
grant execute on function test.eq(anyelement, anyelement, text) to authenticated;

-- Fixed identities
create or replace function test.uid(p_name text) returns uuid language sql immutable as $$
  select case p_name
    when 'admin' then '00000000-0000-0000-0000-00000000000a'::uuid
    when 'tech'  then '00000000-0000-0000-0000-00000000000b'::uuid
    when 'tech2' then '00000000-0000-0000-0000-00000000000c'::uuid
    when 'outsider' then '00000000-0000-0000-0000-00000000000d'::uuid
  end
$$;
grant execute on function test.uid(text) to authenticated;
