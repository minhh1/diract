-- Notifies the affected user when their Gmail sync starts failing.
-- gmail_sync_failures is written by quarantineUser(), duplicated near-
-- identically in two separate edge functions (gmail-email-sync-processor
-- and gmail-label-sync-processor) -- a DB trigger avoids hooking the same
-- notification call in both. AFTER INSERT only (not UPDATE) since both
-- copies of quarantineUser() already distinguish "first failure" (INSERT)
-- from "still failing" (UPDATE last_error/attempts on the existing row) --
-- this only ever fires once per new failure, not on every retry.
CREATE OR REPLACE FUNCTION notify_gmail_sync_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM create_notification(
      NEW.company_id,
      NEW.user_id,
      'gmail_sync_failure',
      'Your Gmail sync needs attention',
      NEW.last_error,
      '/dashboard/gmail',
      'gmail_sync_failures',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_gmail_sync_failure ON gmail_sync_failures;
CREATE TRIGGER trg_notify_gmail_sync_failure
  AFTER INSERT ON gmail_sync_failures
  FOR EACH ROW EXECUTE FUNCTION notify_gmail_sync_failure();
