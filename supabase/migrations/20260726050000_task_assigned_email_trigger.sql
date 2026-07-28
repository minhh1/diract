-- Fires notify-task-assigned whenever a task's assignee_id is set (on
-- insert, or changed on update) -- same net.http_post primitive already
-- used by the cron jobs in ai_embed_cron.sql/teams_sync_cron.sql, just from
-- a row trigger instead of a schedule. This is the DB-level chokepoint
-- because tasks.assignee_id is written from several places (ChecklistTab.tsx
-- and other client components directly, lib/ai/actions.ts's createTask/
-- updateTask, app/api/public-tasks/.../route.ts, and the gmail-addon edge
-- function) with no single shared server-side call site to hook instead.
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id)
  THEN
    PERFORM net.http_post(
      url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/notify-task-assigned',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'task_id', NEW.id,
        'company_id', NEW.company_id,
        'assignee_id', NEW.assignee_id,
        'task_name', NEW.name,
        'project_id', NEW.project_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON tasks;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE OF assignee_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();
