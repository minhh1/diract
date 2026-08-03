-- Atomically creates one real Time & Fee Entries record (+ its values) from
-- an AI-drafted suggestion AND claims its source task/email(s) in
-- time_entry_ai_sources, in a single transaction -- called once per entry
-- from app/api/time-entries/submit/route.ts's loop.
--
-- The atomicity is the whole point: if ANY source in p_sources has already
-- been converted (violates time_entry_ai_sources' unique(source_type,
-- source_id)), the exception aborts this ENTIRE function -- the just-
-- inserted company_table_records/values rows roll back too, so a race
-- between two people submitting the same task/email at once (e.g. a user
-- submitting their own day at the same moment an admin pushes it for them)
-- can never leave behind an orphaned or duplicate Time & Fee Entries row.
-- Whichever call's sources land in the constraint first wins outright; the
-- loser gets a plain Postgres unique-violation error and nothing else.
create or replace function submit_auto_time_entry(
  p_company_id uuid,
  p_table_id uuid,
  p_created_by uuid,
  p_matter_id uuid,
  p_staff_id uuid,
  p_date date,
  p_description text,
  p_hours numeric,
  p_rate numeric,
  p_field_ids jsonb, -- {"matter":uuid,"staff":uuid,"date":uuid,"description":uuid,"duration_hours":uuid,"rate":uuid,"amount":uuid,"billable":uuid,"status":uuid}
  p_sources jsonb    -- [{"source_type":"task"|"email","source_id":uuid}, ...]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_source record;
begin
  if p_company_id is null or p_table_id is null or p_matter_id is null or p_staff_id is null or p_date is null then
    raise exception 'missing required field for auto time entry';
  end if;
  if p_sources is null or jsonb_array_length(p_sources) = 0 then
    raise exception 'at least one source task/email is required';
  end if;

  insert into company_table_records (table_id, company_id, created_by)
    values (p_table_id, p_company_id, p_created_by)
    returning id into v_record_id;

  insert into company_table_values (company_id, table_id, record_id, field_id, value_record_id) values
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'matter')::uuid, p_matter_id),
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'staff')::uuid, p_staff_id);

  insert into company_table_values (company_id, table_id, record_id, field_id, value_date) values
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'date')::uuid, p_date);

  insert into company_table_values (company_id, table_id, record_id, field_id, value_text) values
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'description')::uuid, p_description),
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'status')::uuid, 'Released');

  insert into company_table_values (company_id, table_id, record_id, field_id, value_number) values
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'duration_hours')::uuid, p_hours),
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'rate')::uuid, coalesce(p_rate, 0)),
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'amount')::uuid, coalesce(p_rate, 0) * p_hours);

  insert into company_table_values (company_id, table_id, record_id, field_id, value_boolean) values
    (p_company_id, p_table_id, v_record_id, (p_field_ids->>'billable')::uuid, true);

  for v_source in select * from jsonb_to_recordset(p_sources) as x(source_type text, source_id uuid) loop
    insert into time_entry_ai_sources (company_id, source_type, source_id, company_table_record_id, created_by)
      values (p_company_id, v_source.source_type, v_source.source_id, v_record_id, p_created_by);
  end loop;

  return v_record_id;
end;
$$;
