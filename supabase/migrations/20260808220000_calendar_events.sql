-- Phase 2 of the calendar feature: actual bookable events with invitations
-- (internal staff + external people via a public RSVP page), reminders
-- (folded into the existing daily calendar-reminders-sweep cron), and the
-- groundwork for two-way Google Calendar sync (new columns on
-- user_gmail_tokens; the edge functions that use them are separate, not
-- SQL). Rostering (phase 1) and the generic date-sources reminder system
-- (built concurrently, not part of this phase) are untouched.
ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_events_company_start_idx ON calendar_events (company_id, start_at);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- calendar_event_invites: one row per invitee, either internal (a real
-- company member, internal_user_id set) or external (external_name/
-- external_email set, slug is their public RSVP token). Exactly one of
-- internal_user_id / (external_name, external_email, slug) is set.
CREATE TABLE IF NOT EXISTS calendar_event_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  invite_type text NOT NULL CHECK (invite_type IN ('internal', 'external')),
  internal_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  external_name text,
  external_email text,
  slug text UNIQUE,
  rsvp_status text NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_event_invites_shape CHECK (
    (invite_type = 'internal' AND internal_user_id IS NOT NULL AND external_email IS NULL)
    OR (invite_type = 'external' AND internal_user_id IS NULL AND external_email IS NOT NULL AND slug IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS calendar_event_invites_event_idx ON calendar_event_invites (event_id);

ALTER TABLE calendar_event_invites ENABLE ROW LEVEL SECURITY;

-- calendar_events policies live here, after calendar_event_invites exists --
-- the select policy's EXISTS clause needs it. A member sees an event if
-- they created it, are invited to it, or can manage the calendar generally
-- (admin / calendar.book_events). Select and write kept as separate
-- policies so the invitee-visibility clause never has to also imply write
-- access.
DROP POLICY IF EXISTS calendar_events_select ON calendar_events;
CREATE POLICY calendar_events_select ON calendar_events
  FOR SELECT
  USING (
    company_id = active_company_id() AND (
      created_by = auth.uid()
      OR is_current_user_admin()
      OR user_has_custom_permission('calendar.book_events')
      OR EXISTS (SELECT 1 FROM calendar_event_invites WHERE event_id = calendar_events.id AND internal_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS calendar_events_manage ON calendar_events;
CREATE POLICY calendar_events_manage ON calendar_events
  FOR ALL
  USING (company_id = active_company_id() AND (created_by = auth.uid() OR is_current_user_admin() OR user_has_custom_permission('calendar.book_events')))
  WITH CHECK (company_id = active_company_id() AND (created_by = auth.uid() OR is_current_user_admin() OR user_has_custom_permission('calendar.book_events')));

-- A member sees an invite row if they can see the parent event (organizer/
-- admin/permission holder) or it's their own internal invite.
DROP POLICY IF EXISTS calendar_event_invites_select ON calendar_event_invites;
CREATE POLICY calendar_event_invites_select ON calendar_event_invites
  FOR SELECT
  USING (
    internal_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM calendar_events e WHERE e.id = calendar_event_invites.event_id AND e.company_id = active_company_id() AND (e.created_by = auth.uid() OR is_current_user_admin() OR user_has_custom_permission('calendar.book_events')))
  );

-- Managing the invite list (add/remove invitees) is an organizer/admin
-- action; an internal invitee updating their OWN rsvp_status is a distinct,
-- narrower case handled by a second policy rather than widening this one --
-- RLS can't restrict which COLUMNS a row-owner changes, so
-- app/api/calendar/events/[eventId]/respond/route.ts's own explicit
-- `.eq("internal_user_id", user.id)` update (touching only rsvp_status/
-- responded_at) is the real enforcement; this is defense in depth.
DROP POLICY IF EXISTS calendar_event_invites_manage ON calendar_event_invites;
CREATE POLICY calendar_event_invites_manage ON calendar_event_invites
  FOR ALL
  USING (EXISTS (SELECT 1 FROM calendar_events e WHERE e.id = calendar_event_invites.event_id AND e.company_id = active_company_id() AND (e.created_by = auth.uid() OR is_current_user_admin() OR user_has_custom_permission('calendar.book_events'))))
  WITH CHECK (EXISTS (SELECT 1 FROM calendar_events e WHERE e.id = calendar_event_invites.event_id AND e.company_id = active_company_id() AND (e.created_by = auth.uid() OR is_current_user_admin() OR user_has_custom_permission('calendar.book_events'))));

DROP POLICY IF EXISTS calendar_event_invites_respond ON calendar_event_invites;
CREATE POLICY calendar_event_invites_respond ON calendar_event_invites
  FOR UPDATE
  USING (internal_user_id = auth.uid())
  WITH CHECK (internal_user_id = auth.uid());

-- Two-way Google Calendar sync groundwork -- same user_gmail_tokens row
-- already used for Gmail + the existing one-way task sync (calendar.events
-- scope already granted at connect time, see supabase/functions/calendar-sync).
-- Off by default; a user must opt in explicitly.
ALTER TABLE user_gmail_tokens ADD COLUMN IF NOT EXISTS calendar_sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE user_gmail_tokens ADD COLUMN IF NOT EXISTS calendar_channel_id text;
ALTER TABLE user_gmail_tokens ADD COLUMN IF NOT EXISTS calendar_resource_id text;
ALTER TABLE user_gmail_tokens ADD COLUMN IF NOT EXISTS calendar_channel_expiry timestamptz;
ALTER TABLE user_gmail_tokens ADD COLUMN IF NOT EXISTS calendar_sync_token text;

-- Event reminders, folded into the SAME daily cron as the date-sources
-- sweep (supabase/migrations/20260808200950_calendar_reminders.sql) rather
-- than a new schedule -- see that migration for calendar_reminders_sent's
-- shape and process_calendar_reminder()'s own dedup pattern, mirrored here
-- keyed by (event_id, invite_id) instead of (source_id, record_id).
CREATE TABLE IF NOT EXISTS calendar_event_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES calendar_event_invites(id) ON DELETE CASCADE,
  reminded_for_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, reminded_for_date)
);
ALTER TABLE calendar_event_reminders_sent ENABLE ROW LEVEL SECURITY;

-- Internal-only -- external invitees have no in-app notification target
-- (create_notification requires a real recipient_user_id) and sending an
-- email is a TypeScript/Resend call a SQL function can't make directly.
-- Rather than have Postgres call back out to a Next.js route over HTTP
-- (net.http_post + a shared secret, extra moving parts) for just this one
-- case, app/api/calendar/reminders/sweep-external/route.ts (cron-called,
-- same CRON_SECRET pattern as the app's other sweep routes) owns the whole
-- external-reminder cycle independently -- its own query for today's
-- confirmed events, its own dedup insert into this SAME
-- calendar_event_reminders_sent table (safe: each path only ever inserts
-- rows for its own invite_type, no collision), then sendEmail(). This
-- function and cron stay internal-only.
CREATE OR REPLACE FUNCTION process_calendar_event_reminder(p_event calendar_events, p_invite calendar_event_invites, p_today date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link text := '/dashboard/calendar?event=' || p_event.id::text;
BEGIN
  IF p_invite.invite_type != 'internal' THEN RETURN; END IF;

  BEGIN
    INSERT INTO calendar_event_reminders_sent (event_id, invite_id, reminded_for_date) VALUES (p_event.id, p_invite.id, p_today);
  EXCEPTION WHEN unique_violation THEN
    RETURN;
  END;

  PERFORM create_notification(p_event.company_id, p_invite.internal_user_id, 'calendar_event_reminder',
    p_event.title || ' is today', p_event.location, v_link);
END;
$$;

CREATE OR REPLACE FUNCTION sweep_calendar_event_reminders() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event calendar_events;
  v_invite calendar_event_invites;
  v_today date := (now() AT TIME ZONE 'Australia/Sydney')::date;
BEGIN
  FOR v_event IN SELECT * FROM calendar_events WHERE status = 'confirmed' AND start_at::date = v_today LOOP
    FOR v_invite IN SELECT * FROM calendar_event_invites WHERE event_id = v_event.id AND invite_type = 'internal' LOOP
      PERFORM process_calendar_event_reminder(v_event, v_invite, v_today);
    END LOOP;
  END LOOP;
END;
$$;

-- Same cron job as the date-sources sweep now runs all three -- the two SQL
-- sweeps above, plus a net.http_post to the calendar-event-reminders edge
-- function (supabase/functions/calendar-event-reminders/index.ts) for
-- EXTERNAL invitees, following the exact same "PERFORM net.http_post to a
-- functions/v1/<name> URL" shape create_notification already uses -- one
-- daily 6am-AEST job, not separate schedules.
SELECT cron.unschedule('calendar-reminders-sweep') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-reminders-sweep');
SELECT cron.schedule('calendar-reminders-sweep', '0 20 * * *', $$
  SELECT sweep_calendar_reminders();
  SELECT sweep_calendar_event_reminders();
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/calendar-event-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
