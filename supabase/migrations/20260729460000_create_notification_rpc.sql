-- The single entry point every notification-worthy event goes through --
-- called identically as `PERFORM create_notification(...)` from a trigger,
-- or `.rpc('create_notification', {...})` from a Next.js API route or a
-- Deno edge function. Centralizing here means the per-user/per-company
-- gating logic exists exactly once instead of being reimplemented at each
-- of the ~12 call sites across three different runtimes.
--
-- Two independent gates per channel, both must allow it:
--  - profiles.notification_preferences->event_type (per-user, this migration
--    series' new thing -- see 20260729450000_notification_preferences.sql)
--  - companies.email_notification_settings / push_notification_settings
--    (per-company, pre-existing -- see components/admin/AdminEmailTab.tsx)
-- Either missing (no explicit `false`) defaults to on, matching the
-- opt-out convention both existing company-level settings already use.
--
-- SECURITY DEFINER so it can read profiles/companies and write notifications
-- for an arbitrary recipient regardless of the calling context's own RLS
-- (a trigger's caller is whoever wrote the source row, not the recipient).
CREATE OR REPLACE FUNCTION create_notification(
  p_company_id uuid,
  p_recipient_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link_url text DEFAULT NULL,
  p_entity_table text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs jsonb;
  v_event_prefs jsonb;
  v_in_app_on boolean;
  v_email_on boolean;
  v_push_on boolean;
  v_company_email_settings jsonb;
  v_company_push_settings jsonb;
  v_send_email boolean;
  v_send_push boolean;
BEGIN
  IF p_recipient_user_id IS NULL THEN RETURN; END IF;

  SELECT notification_preferences INTO v_prefs FROM profiles WHERE id = p_recipient_user_id;
  v_event_prefs := COALESCE(v_prefs, '{}'::jsonb) -> p_event_type;

  v_in_app_on := COALESCE((v_event_prefs ->> 'in_app')::boolean, true);
  v_email_on := COALESCE((v_event_prefs ->> 'email')::boolean, true);
  v_push_on := COALESCE((v_event_prefs ->> 'push')::boolean, true);

  IF v_in_app_on THEN
    INSERT INTO notifications (company_id, recipient_user_id, event_type, title, body, link_url, entity_table, entity_id)
    VALUES (p_company_id, p_recipient_user_id, p_event_type, p_title, p_body, p_link_url, p_entity_table, p_entity_id);
  END IF;

  IF p_company_id IS NOT NULL THEN
    SELECT email_notification_settings, push_notification_settings
      INTO v_company_email_settings, v_company_push_settings
      FROM companies WHERE id = p_company_id;
  END IF;

  v_send_email := v_email_on AND COALESCE((v_company_email_settings ->> p_event_type)::boolean, true);
  v_send_push := v_push_on AND COALESCE((v_company_push_settings ->> p_event_type)::boolean, true);

  IF v_send_email OR v_send_push THEN
    PERFORM net.http_post(
      url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/notify-dispatch',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'recipient_user_id', p_recipient_user_id,
        'company_id', p_company_id,
        'event_type', p_event_type,
        'title', p_title,
        'body', p_body,
        'link_url', p_link_url,
        'send_email', v_send_email,
        'send_push', v_send_push
      )
    );
  END IF;
END;
$$;

-- Fan-out helper -- 5 of the new event triggers/hooks notify "every admin
-- of this company" (archive_request_submitted, team_member_joined,
-- gmail_needs_review, irregularity_detected, matter_created); this avoids
-- repeating the same membership loop in each one.
CREATE OR REPLACE FUNCTION notify_company_admins(
  p_company_id uuid,
  p_event_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link_url text DEFAULT NULL,
  p_entity_table text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  FOR v_admin_id IN
    SELECT user_id FROM company_memberships WHERE company_id = p_company_id AND role = 'company_admin'
  LOOP
    PERFORM create_notification(p_company_id, v_admin_id, p_event_type, p_title, p_body, p_link_url, p_entity_table, p_entity_id);
  END LOOP;
END;
$$;
