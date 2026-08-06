-- Companion to 20260806050000: email_sync's loop never recorded an
-- already-claimed import as resolved (see the matching fix/comment in
-- gmail-migration-worker and gmail-sync-recovery-worker's email_sync
-- branches), so it re-ran userHasMessage + a doomed-to-fail claimImport on
-- the same already-imported foreign message ids every tick forever, never
-- converging. Requeues the email_sync jobs stuck under the old behavior so
-- they retry immediately under the fix.
UPDATE gmail_migration_jobs
SET status = 'pending', attempts = 0, consecutive_stall_count = 0, updated_at = now()
WHERE status = 'persistent_failure' AND job_type = 'email_sync';

UPDATE gmail_sync_failures
SET status = 'pending_retry', attempts = 0, consecutive_stall_count = 0
WHERE status = 'persistent_failure' AND job_type = 'email_sync';
