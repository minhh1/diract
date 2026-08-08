-- Daily sweep: for every calendar_date_sources row, find records due today
-- and send a calendar_date_due notification (reusing create_notification /
-- notify_company_admins from 20260729460000_create_notification_rpc.sql --
-- same in-app/email/push gating every other event already goes through,
-- not a new parallel send path).
SET request.jwt.claim.role = 'service_role';

CREATE TABLE IF NOT EXISTS calendar_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES calendar_date_sources(id) ON DELETE CASCADE,
  record_id uuid NOT NULL,
  reminded_for_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, record_id, reminded_for_date)
);
-- No policies -- this is pure sweep bookkeeping, never read or written from
-- the client. RLS enabled with zero policies means default-deny for every
-- role except the service-role client sweep_calendar_reminders() itself
-- runs as (SECURITY DEFINER).
ALTER TABLE calendar_reminders_sent ENABLE ROW LEVEL SECURITY;

-- One record's worth of reminder logic, split out of sweep_calendar_reminders()
-- below so that loop stays about *finding* due records (three different
-- ways, one per source shape) and this stays about *what to do* once one is
-- found -- dedupe, build a deep link, resolve who to notify, send.
CREATE OR REPLACE FUNCTION process_calendar_reminder(
  p_source calendar_date_sources, p_record_id uuid, p_name text, p_today date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link text;
  v_recipient_entity_id uuid;
  v_recipient_profile_id uuid;
BEGIN
  IF p_record_id IS NULL THEN RETURN; END IF;

  -- Dedup via the unique constraint -- a sweep re-run (manual, or the cron
  -- firing twice) must not double-notify the same record for the same date.
  BEGIN
    INSERT INTO calendar_reminders_sent (source_id, record_id, reminded_for_date) VALUES (p_source.id, p_record_id, p_today);
  EXCEPTION WHEN unique_violation THEN
    RETURN;
  END;

  IF p_source.table_name = 'tasks' THEN v_link := '/dashboard/tasks?id=' || p_record_id::text;
  ELSIF p_source.table_name = 'projects' THEN v_link := '/dashboard/projects?id=' || p_record_id::text;
  ELSIF p_source.table_name = 'entities' THEN v_link := '/dashboard/entities?id=' || p_record_id::text;
  ELSIF p_source.table_id IS NOT NULL THEN
    v_link := '/dashboard/' || (SELECT slug FROM company_tables WHERE id = p_source.table_id) || '?id=' || p_record_id::text;
  END IF;

  -- notify_field_id, when set, names a relation field on the SAME record
  -- pointing at a Staff entity -- resolve that entity's linked_profile_id
  -- (see lib/services/staffEntityService.ts) as the recipient. No
  -- notify_field_id, or the relation is empty, falls back to every company
  -- admin -- the same fallback every other admin-facing event already uses.
  IF p_source.notify_field_id IS NOT NULL THEN
    IF p_source.table_name IS NOT NULL THEN
      SELECT value_record_id INTO v_recipient_entity_id FROM company_custom_field_values
        WHERE field_id = p_source.notify_field_id AND record_id = p_record_id;
    ELSIF p_source.table_id IS NOT NULL THEN
      SELECT value_record_id INTO v_recipient_entity_id FROM company_table_values
        WHERE table_id = p_source.table_id AND field_id = p_source.notify_field_id AND record_id = p_record_id;
    END IF;
    IF v_recipient_entity_id IS NOT NULL THEN
      SELECT linked_profile_id INTO v_recipient_profile_id FROM entities WHERE id = v_recipient_entity_id;
    END IF;
  END IF;

  IF v_recipient_profile_id IS NOT NULL THEN
    PERFORM create_notification(p_source.company_id, v_recipient_profile_id, 'calendar_date_due',
      p_source.label || ': ' || COALESCE(p_name, 'Untitled'), NULL, v_link);
  ELSE
    PERFORM notify_company_admins(p_source.company_id, 'calendar_date_due',
      p_source.label || ': ' || COALESCE(p_name, 'Untitled'), NULL, v_link);
  END IF;
END;
$$;

-- The three ways a due-today record can be found, one per calendar_date_sources
-- shape (see that table's own migration comment): a native system-table
-- column (today, only tasks.due_date), a custom field on a system table
-- (company_custom_field_values), or a field on a custom table
-- (company_table_values). "Today" is pinned to Australia/Sydney to match
-- companyTodayStr()'s AU-vertical behavior in lib/companyLocalDate.ts --
-- every company using this today is a law firm or property developer.
CREATE OR REPLACE FUNCTION sweep_calendar_reminders() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source calendar_date_sources;
  v_due record;
  v_today date := (now() AT TIME ZONE 'Australia/Sydney')::date;
BEGIN
  FOR v_source IN SELECT * FROM calendar_date_sources LOOP
    IF v_source.native_field_key = 'due_date' AND v_source.table_name = 'tasks' THEN
      FOR v_due IN
        SELECT id AS record_id, name FROM tasks
        WHERE company_id = v_source.company_id AND due_date >= v_today AND due_date < v_today + 1
      LOOP
        PERFORM process_calendar_reminder(v_source, v_due.record_id, v_due.name, v_today);
      END LOOP;

    ELSIF v_source.table_name IS NOT NULL THEN
      FOR v_due IN
        SELECT ccfv.record_id,
          CASE v_source.table_name
            WHEN 'tasks' THEN (SELECT name FROM tasks WHERE id = ccfv.record_id)
            WHEN 'projects' THEN (SELECT name FROM projects WHERE id = ccfv.record_id)
            WHEN 'entities' THEN (SELECT name FROM entities WHERE id = ccfv.record_id)
          END AS name
        FROM company_custom_field_values ccfv
        WHERE ccfv.company_id = v_source.company_id AND ccfv.field_id = v_source.field_id AND ccfv.value_date = v_today
      LOOP
        PERFORM process_calendar_reminder(v_source, v_due.record_id, v_due.name, v_today);
      END LOOP;

    ELSIF v_source.table_id IS NOT NULL THEN
      FOR v_due IN
        SELECT ctv.record_id,
          (SELECT ctv2.value_text FROM company_table_values ctv2
             JOIN company_table_fields ctf ON ctf.id = ctv2.field_id AND ctf.table_id = v_source.table_id
             JOIN company_tables ct ON ct.id = v_source.table_id
             WHERE ctv2.record_id = ctv.record_id AND ctv2.table_id = v_source.table_id AND ctf.field_key = ct.primary_field_key
             LIMIT 1) AS name
        FROM company_table_values ctv
        WHERE ctv.table_id = v_source.table_id AND ctv.field_id = v_source.field_id AND ctv.value_date = v_today
      LOOP
        PERFORM process_calendar_reminder(v_source, v_due.record_id, v_due.name, v_today);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- 6am AEST -- see 20260726110100_db_maintenance_cron.sql's own comment on
-- why this company's cron jobs are scheduled against AEST, not literal UTC.
SELECT cron.schedule('calendar-reminders-sweep', '0 20 * * *', $$ SELECT sweep_calendar_reminders() $$);
