-- Repoints the existing task-assigned trigger (supabase/migrations/
-- 20260726050000_task_assigned_email_trigger.sql) onto the new generic
-- create_notification() pipeline instead of calling the now-retired
-- notify-task-assigned edge function directly. This is what gives
-- task_assigned an in-app notification for the first time (it previously
-- only ever emailed/pushed) and brings it under the new per-user
-- notification_preferences gate, same as every other event.
--
-- Trigger condition (assignee_id set/changed) and the reasoning for why
-- this must be a DB trigger rather than an app-layer call site are
-- unchanged from the original migration -- see that file's header comment.
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_name text;
BEGIN
  IF NEW.assignee_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id)
  THEN
    IF NEW.project_id IS NOT NULL THEN
      SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
    END IF;

    PERFORM create_notification(
      NEW.company_id,
      NEW.assignee_id,
      'task_assigned',
      'You were assigned: ' || NEW.name,
      CASE WHEN v_project_name IS NOT NULL THEN 'In ' || v_project_name ELSE NULL END,
      '/dashboard/tasks?id=' || NEW.id::text,
      'tasks',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger itself (name, table, timing) is unchanged -- CREATE OR REPLACE
-- FUNCTION above is all that's needed to repoint it.
