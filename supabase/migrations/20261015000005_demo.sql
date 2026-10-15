-- DENTRACK demo workspace.
-- Creates a SEPARATE laboratory flagged is_demo = true, owned by the caller, filled with fictional
-- clinics, patients, technicians, cases, costs, invoices and payments. All prices/costs/wages here are
-- illustrative demo values, never used outside the demo laboratory. Calculations run through the same
-- schema, so every derived number is mathematically consistent.

create or replace function public.create_demo_laboratory() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lab uuid;
  v_today date;
  v_tz text := 'Europe/Budapest';
  v_stage jsonb := '{}'::jsonb;
  v_cat jsonb := '{}'::jsonb;
  v_svc jsonb := '{}'::jsonb;
  v_mat jsonb := '{}'::jsonb;
  v_techs uuid[];
  v_tech_names text[] := array['Elena Varga', 'Marco Rossi', 'Lina Berisha', 'Jonas Weber'];
  v_clinics uuid[];
  v_dentists uuid[];
  v_trays uuid[];
  v_tray_cursor int := 1;
  tmpl jsonb;
  templates jsonb := '[
    {"svc":"Monolithic zirconia crown","cat":"Zirconia crowns","price":120,"days":6,
     "mat":[["Zirconia disc 98mm",0.08],["Stain & glaze kit",1],["Milling bur wear",1]],
     "labor":[["CAD design",0.75],["Milling & sintering supervision",0.5],["Stain, glaze & fit",0.75]]},
    {"svc":"Layered zirconia crown","cat":"Zirconia crowns","price":160,"days":8,
     "mat":[["Zirconia disc 98mm",0.08],["Ceramic powder",2.5],["Milling bur wear",1]],
     "labor":[["CAD design",0.75],["Ceramic layering",1.5],["Finishing",0.5]]},
    {"svc":"PFM crown","cat":"Metal-ceramic crowns","price":95,"days":7,
     "mat":[["CoCr alloy",6],["Ceramic powder",3],["Modelling wax",4]],
     "labor":[["Wax-up & casting",1],["Ceramic build-up",1.25],["Finishing",0.5]]},
    {"svc":"Full acrylic denture","cat":"Acrylic dentures","price":280,"days":10,
     "mat":[["Acrylic resin (heat-cure)",45],["Denture teeth set",1],["Modelling wax",20]],
     "labor":[["Tooth set-up",2],["Processing & curing",1.5],["Finishing & polish",1]]},
    {"svc":"Flexible partial denture","cat":"Flexible dentures","price":240,"days":9,
     "mat":[["Flexible nylon cartridge",1],["Denture teeth set",0.5]],
     "labor":[["Design & set-up",1.5],["Injection",1],["Finishing",0.75]]},
    {"svc":"3-unit zirconia bridge","cat":"Bridges","price":360,"days":9,
     "mat":[["Zirconia disc 98mm",0.22],["Stain & glaze kit",1],["Milling bur wear",2]],
     "labor":[["CAD design",1.25],["Milling & sintering supervision",0.75],["Stain, glaze & fit",1.25]]},
    {"svc":"Screw-retained implant crown","cat":"Implant-supported prosthetics","price":220,"days":10,
     "mat":[["Zirconia disc 98mm",0.08],["Ti-base abutment",1],["Stain & glaze kit",1]],
     "labor":[["Implant planning & design",1],["Bonding to Ti-base",0.5],["Finishing",0.75]]},
    {"svc":"Essix retainer","cat":"Retainers","price":45,"days":3,
     "mat":[["Thermoforming sheet",1]],
     "labor":[["Model trim & thermoform",0.5]]},
    {"svc":"Denture repair","cat":"Repairs","price":40,"days":2,
     "mat":[["Acrylic resin (self-cure)",10]],
     "labor":[["Repair",0.75]]},
    {"svc":"Denture reline","cat":"Relines","price":70,"days":3,
     "mat":[["Acrylic resin (heat-cure)",20]],
     "labor":[["Reline & processing",1.25]]}
  ]'::jsonb;
  r record;
  i int;
  n_cases int := 58;
  v_case uuid;
  v_patient uuid;
  v_received date;
  v_due date;
  v_ci int;
  v_ti int;
  v_state text;
  v_stage_id uuid;
  v_completed timestamptz;
  v_delivered timestamptz;
  v_price numeric;
  v_discount numeric;
  m jsonb;
  l jsonb;
  h int;
  v_month date;
  v_inv uuid;
  v_ids uuid[];
  v_total numeric;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  v_lab := create_laboratory('Demo Dental Lab', v_tz, 'EUR', 24, true);
  update laboratories set contact_email = 'demo@dentrack.example', phone = '+00 000 000 000',
    address = 'Demo Street 1 (fictional)' where id = v_lab;
  v_today := lab_today(v_lab);

  select jsonb_object_agg(coalesce(system_key::text, name), id) into v_stage from production_stages where laboratory_id = v_lab;
  select jsonb_object_agg(name, id) into v_cat from prosthetic_categories where laboratory_id = v_lab;
  select array_agg(id order by number) into v_trays from trays where laboratory_id = v_lab;

  -- Technicians (fictional, no login accounts) + the demo owner as a technician too
  for i in 1..array_length(v_tech_names, 1) loop
    insert into technicians (laboratory_id, full_name, job_title) values (v_lab, v_tech_names[i],
      case i when 1 then 'Senior CAD/CAM technician' when 2 then 'Ceramist' when 3 then 'Prosthetics technician' else 'Technician' end)
    returning id into v_case;
    v_techs := array_append(v_techs, v_case);
  end loop;

  -- Clinics & dentists
  insert into clinics (laboratory_id, name, email, phone) values
    (v_lab, 'Riverside Dental Studio', 'front@riverside.example', '+00 111 0001'),
    (v_lab, 'Old Town Smile Clinic', 'hello@oldtown.example', '+00 111 0002'),
    (v_lab, 'Parkview Family Dentistry', 'info@parkview.example', '+00 111 0003');
  select array_agg(id order by name) into v_clinics from clinics where laboratory_id = v_lab;
  insert into dentists (laboratory_id, clinic_id, full_name)
  select v_lab, c, d from unnest(v_clinics, array['Dr. Arben Hoxha', 'Dr. Sara Lind', 'Dr. Mia Novak']) x(c, d);
  select array_agg(d.id order by c.name) into v_dentists from dentists d join clinics c on c.id = d.clinic_id where d.laboratory_id = v_lab;

  -- Services & demo price list
  for tmpl in select * from jsonb_array_elements(templates) loop
    insert into services (laboratory_id, category_id, name) values (v_lab, (v_cat ->> (tmpl ->> 'cat'))::uuid, tmpl ->> 'svc')
    returning id into v_case;
    v_svc := v_svc || jsonb_build_object(tmpl ->> 'svc', v_case);
    insert into service_prices (laboratory_id, service_id, price, effective_from, created_by)
    values (v_lab, v_case, (tmpl ->> 'price')::numeric, v_today - 365, v_uid);
  end loop;

  -- Material catalog (demo unit costs)
  insert into material_catalog (laboratory_id, name, unit, default_unit_cost) values
    (v_lab, 'Zirconia disc 98mm', 'disc', 185.00),
    (v_lab, 'Ceramic powder', 'g', 0.95),
    (v_lab, 'CoCr alloy', 'g', 0.85),
    (v_lab, 'Modelling wax', 'g', 0.04),
    (v_lab, 'Stain & glaze kit', 'application', 1.40),
    (v_lab, 'Milling bur wear', 'use', 2.60),
    (v_lab, 'Acrylic resin (heat-cure)', 'g', 0.07),
    (v_lab, 'Acrylic resin (self-cure)', 'g', 0.09),
    (v_lab, 'Denture teeth set', 'set', 24.00),
    (v_lab, 'Flexible nylon cartridge', 'cartridge', 21.50),
    (v_lab, 'Ti-base abutment', 'unit', 38.00),
    (v_lab, 'Thermoforming sheet', 'sheet', 3.20);
  select jsonb_object_agg(name, jsonb_build_object('id', id, 'unit', unit, 'cost', default_unit_cost)) into v_mat
  from material_catalog where laboratory_id = v_lab;

  -- Labor rates (demo): lab default + one technician-specific rate
  insert into labor_rates (laboratory_id, technician_id, hourly_rate, effective_from, created_by) values
    (v_lab, null, 8.00, v_today - 365, v_uid),
    (v_lab, v_techs[1], 9.50, v_today - 365, v_uid);

  -- Cases spread over the last ~4 months
  for i in 1..n_cases loop
    h := abs(hashtext('demo' || i));
    tmpl := templates -> (h % jsonb_array_length(templates));
    v_ci := 1 + (h / 7) % 3;
    v_ti := 1 + (h / 11) % 4;
    v_received := v_today - round(125 * power(1 - i::numeric / (n_cases + 1), 1.6))::int;
    v_due := v_received + (tmpl ->> 'days')::int;

    if v_due < v_today - 4 then v_state := 'delivered';
    elsif i % 5 = 0 and v_due < v_today then v_state := 'completed';
    elsif v_due < v_today then v_state := case when i % 2 = 0 then 'overdue' else 'completed' end;
    else v_state := 'active';
    end if;

    v_completed := null; v_delivered := null;
    if v_state in ('completed', 'delivered') then
      v_completed := ((v_due - 1)::timestamp + time '15:30') at time zone v_tz;
    end if;
    if v_state = 'delivered' then
      v_delivered := (v_due::timestamp + time '10:00') at time zone v_tz;
    end if;
    v_stage_id := case v_state
      when 'delivered' then (v_stage ->> 'delivered')::uuid
      when 'completed' then (v_stage ->> 'completed')::uuid
      else (v_stage ->> (case (h / 13) % 3 when 0 then 'received' when 1 then 'In Production' else 'Quality Check' end))::uuid end;

    insert into patients (laboratory_id, clinic_id, reference, full_name)
    values (v_lab, v_clinics[v_ci], format('PT-%s', lpad((1000 + i)::text, 4, '0')), null)
    returning id into v_patient;

    insert into cases (laboratory_id, reference, patient_id, clinic_id, dentist_id, category_id, service_id, technician_id,
                       stage_id, lifecycle, priority, units, received_date, due_date, completed_at, delivered_at,
                       materials_confirmed, labor_confirmed, other_costs_confirmed, created_by, created_at, shade)
    values (v_lab, format('C-%s-%s', to_char(v_received, 'YYYY'), lpad(i::text, 4, '0')), v_patient, v_clinics[v_ci],
            v_dentists[v_ci], (v_cat ->> (tmpl ->> 'cat'))::uuid, (v_svc ->> (tmpl ->> 'svc'))::uuid,
            case when i % 13 = 0 and v_state = 'active' then null else v_techs[v_ti] end,
            v_stage_id,
            case v_state when 'delivered' then 'delivered'::case_lifecycle when 'completed' then 'completed' else 'active' end,
            case when h % 9 = 0 then 'urgent'::case_priority when h % 4 = 0 then 'high' else 'normal' end,
            1, v_received, v_due, v_completed, v_delivered,
            v_state = 'delivered' and i % 6 <> 0, v_state = 'delivered' and i % 6 <> 0, v_state = 'delivered' and i % 6 <> 0,
            v_uid, (v_received::timestamp + time '09:00') at time zone v_tz,
            (array['A1', 'A2', 'A3', 'B1', 'B2', 'C1'])[1 + h % 6])
    returning id into v_case;

    v_price := (tmpl ->> 'price')::numeric;
    v_discount := case when i % 8 = 0 then round(v_price * 0.10, 2) else 0 end;
    insert into case_financials (case_id, laboratory_id, selling_price, discount_amount, price_source, updated_by)
    values (v_case, v_lab, v_price, v_discount, 'price_list', v_uid);

    -- Stage history
    insert into case_status_history (laboratory_id, case_id, from_stage_id, to_stage_id, changed_by, changed_at, note)
    values (v_lab, v_case, null, (v_stage ->> 'received')::uuid, v_uid, (v_received::timestamp + time '09:00') at time zone v_tz, 'Case received');
    if v_stage_id <> (v_stage ->> 'received')::uuid then
      insert into case_status_history (laboratory_id, case_id, from_stage_id, to_stage_id, changed_by, changed_at)
      values (v_lab, v_case, (v_stage ->> 'received')::uuid, (v_stage ->> 'In Production')::uuid, v_uid,
              ((v_received + 1)::timestamp + time '08:30') at time zone v_tz);
    end if;
    if v_state in ('completed', 'delivered') then
      insert into case_status_history (laboratory_id, case_id, from_stage_id, to_stage_id, changed_by, changed_at)
      values (v_lab, v_case, (v_stage ->> 'In Production')::uuid, (v_stage ->> 'completed')::uuid, v_uid, v_completed);
    end if;
    if v_state = 'delivered' then
      insert into case_status_history (laboratory_id, case_id, from_stage_id, to_stage_id, changed_by, changed_at)
      values (v_lab, v_case, (v_stage ->> 'completed')::uuid, (v_stage ->> 'delivered')::uuid, v_uid, v_delivered);
    end if;

    -- Recorded direct costs (delivered and some completed/in-production cases)
    if v_state in ('delivered', 'completed') or (v_state = 'active' and v_stage_id = (v_stage ->> 'Quality Check')::uuid) then
      for m in select * from jsonb_array_elements(tmpl -> 'mat') loop
        insert into case_material_costs (laboratory_id, case_id, material_id, material_name, unit, quantity, unit_cost, recorded_on, created_by)
        values (v_lab, v_case, (v_mat -> (m ->> 0) ->> 'id')::uuid, m ->> 0, v_mat -> (m ->> 0) ->> 'unit',
                (m ->> 1)::numeric, (v_mat -> (m ->> 0) ->> 'cost')::numeric, v_received + 1, v_uid);
      end loop;
      for l in select * from jsonb_array_elements(tmpl -> 'labor') loop
        insert into case_labor_entries (laboratory_id, case_id, technician_id, technician_name, task, entry_type, hours, hourly_rate, work_date, created_by)
        values (v_lab, v_case, v_techs[v_ti], v_tech_names[v_ti], l ->> 0, 'hours', (l ->> 1)::numeric,
                case when v_ti = 1 then 9.50 else 8.00 end, v_received + 1, v_uid);
      end loop;
      if i % 4 = 0 then
        insert into case_other_direct_costs (laboratory_id, case_id, category, description, amount, cost_date, supplier, created_by)
        values (v_lab, v_case, 'external_scanning', 'Intraoral scan conversion', 8.00, v_received, 'ScanPartner (fictional)', v_uid);
      end if;
      if i % 7 = 0 then
        insert into case_other_direct_costs (laboratory_id, case_id, category, description, amount, cost_date, supplier, created_by)
        values (v_lab, v_case, 'logistics', 'Courier delivery to clinic', 6.50, v_due, 'CityCourier (fictional)', v_uid);
      end if;
    end if;

    -- Trays: every case still in the lab occupies a tray; delivered cases were released
    if v_state <> 'delivered' and v_tray_cursor <= array_length(v_trays, 1) then
      insert into tray_assignments (laboratory_id, tray_id, case_id, assigned_by, assigned_at)
      values (v_lab, v_trays[v_tray_cursor], v_case, v_uid, (v_received::timestamp + time '09:05') at time zone v_tz);
      v_tray_cursor := v_tray_cursor + 1;
    elsif v_state = 'delivered' then
      insert into tray_assignments (laboratory_id, tray_id, case_id, assigned_by, assigned_at, released_at, released_by, release_confirmed_empty)
      values (v_lab, v_trays[1 + (h % array_length(v_trays, 1))], v_case, v_uid,
              (v_received::timestamp + time '09:05') at time zone v_tz, v_delivered - interval '30 minutes', v_uid, true);
    end if;

    insert into activity_logs (laboratory_id, actor_id, case_id, action, summary, created_at) values
      (v_lab, v_uid, v_case, 'case.created', format('Case C-%s-%s created', to_char(v_received, 'YYYY'), lpad(i::text, 4, '0')),
       (v_received::timestamp + time '09:00') at time zone v_tz);
    if v_state in ('completed', 'delivered') then
      insert into activity_logs (laboratory_id, actor_id, case_id, action, summary, created_at) values
        (v_lab, v_uid, v_case, 'case.stage', format('Case C-%s-%s moved to Completed', to_char(v_received, 'YYYY'), lpad(i::text, 4, '0')), v_completed);
    end if;
    if v_state = 'delivered' then
      insert into activity_logs (laboratory_id, actor_id, case_id, action, summary, created_at) values
        (v_lab, v_uid, v_case, 'case.stage', format('Case C-%s-%s delivered', to_char(v_received, 'YYYY'), lpad(i::text, 4, '0')), v_delivered);
    end if;
  end loop;
  insert into lab_counters (laboratory_id, key, value) values (v_lab, 'case:' || to_char(v_today, 'YYYY'), n_cases)
  on conflict (laboratory_id, key) do update set value = excluded.value;

  -- Monthly invoices per clinic for delivered cases of completed months; payments for older months
  for v_month in select generate_series(date_trunc('month', v_today - 120), date_trunc('month', v_today) - interval '1 month', interval '1 month')::date loop
    for v_ci in 1..3 loop
      select array_agg(c.id) into v_ids from cases c
      where c.laboratory_id = v_lab and c.clinic_id = v_clinics[v_ci] and c.lifecycle = 'delivered'
        and date_trunc('month', local_date(c.delivered_at, v_tz)) = v_month;
      continue when v_ids is null;
      v_inv := create_invoice(v_lab, v_clinics[v_ci], v_ids, '[]', true,
                              (v_month + interval '1 month - 1 day')::date, (v_month + interval '2 months - 1 day')::date);
      select total into v_total from invoice_balances where invoice_id = v_inv;
      if (v_month + interval '2 months - 1 day')::date < v_today then
        perform record_payment(v_lab, v_clinics[v_ci], v_total, least(v_today, (v_month + interval '1 month + 20 days')::date),
          'bank_transfer', 'DEMO-' || substr(v_inv::text, 1, 8), gen_random_uuid(),
          jsonb_build_array(jsonb_build_object('invoice_id', v_inv, 'amount', v_total)));
      elsif v_ci = 1 then
        perform record_payment(v_lab, v_clinics[v_ci], round(v_total / 2, 2), least(v_today, (v_month + interval '1 month + 10 days')::date),
          'bank_transfer', 'DEMO-' || substr(v_inv::text, 1, 8), gen_random_uuid(),
          jsonb_build_array(jsonb_build_object('invoice_id', v_inv, 'amount', round(v_total / 2, 2))));
      end if;
    end loop;
  end loop;

  -- Operating expenses (demo)
  for v_month in select generate_series(date_trunc('month', v_today - 120), date_trunc('month', v_today), interval '1 month')::date loop
    insert into operating_expenses (laboratory_id, category, description, amount, expense_date, recurrence, created_by) values
      (v_lab, 'rent', 'Workshop rent', 620.00, v_month, 'monthly', v_uid),
      (v_lab, 'electricity', 'Electricity', 180.00 + (extract(month from v_month)::int % 3) * 15, v_month + 4, 'monthly', v_uid),
      (v_lab, 'internet', 'Internet & phone', 39.00, v_month + 2, 'monthly', v_uid),
      (v_lab, 'software', 'CAD software subscription', 89.00, v_month + 1, 'monthly', v_uid);
  end loop;

  delete from activity_logs where laboratory_id = v_lab and action in ('tray.added', 'invoice.created', 'payment.recorded');
  perform generate_deadline_notifications(v_lab);
  perform _log(v_lab, 'lab.demo', 'Demo workspace generated (all data fictional)');
  return v_lab;
end $$;
