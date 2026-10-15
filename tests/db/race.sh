#!/usr/bin/env bash
# Two concurrent sessions try to put different cases into the same tray at the same moment.
# Exactly one must win. Run via scripts/test-db.sh (needs $DB).
set -uo pipefail
DB="$1"
q() { psql -X -q -t -A -d "$DB" "$@"; }
q -c "
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'race@lab.test');
select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000f1\"}', false);
set role authenticated;
select create_laboratory('Race Lab', 'UTC', 'EUR', 1);
" >/dev/null
LAB=$(q -c "select id from laboratories where name = 'Race Lab'")
TRAY=$(q -c "select id from trays where laboratory_id = '$LAB'")
CAT=$(q -c "select id from prosthetic_categories where laboratory_id = '$LAB' limit 1")
CLINIC=$(q -c "insert into clinics (laboratory_id, name) values ('$LAB', 'Race Clinic') returning id")
mk() { q -c "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000f1\"}', false); set role authenticated;
  select create_case('$LAB', '{\"patient_reference\":\"$1\",\"clinic_id\":\"$CLINIC\",\"category_id\":\"$CAT\",\"due_date\":\"2030-01-01\"}')" | tail -1; }
C1=$(mk R1); C2=$(mk R2)
race() { q -c "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000f1\"}', false); set role authenticated;
  select pg_sleep(0.5 - extract(milliseconds from clock_timestamp())::int % 500 / 1000.0); select assign_tray('$TRAY', '$1');" 2>&1; }
race "$C1" > /tmp/race1.out & race "$C2" > /tmp/race2.out & wait
WINS=$(q -c "select count(*) from tray_assignments where tray_id = '$TRAY' and released_at is null")
ERRS=$(cat /tmp/race1.out /tmp/race2.out | grep -c -E "already occupied|just taken")
if [ "$WINS" = "1" ] && [ "$ERRS" = "1" ]; then echo "  ok - concurrent assignment: exactly one winner"; else
  echo "FAIL race: active=$WINS errors=$ERRS"; cat /tmp/race1.out /tmp/race2.out; exit 1; fi
