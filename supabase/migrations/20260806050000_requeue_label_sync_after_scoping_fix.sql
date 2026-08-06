-- Root cause of the 2+ hour, 6+ matter gmail_migration_jobs stall found in
-- gmail_sync_log's existing apply_label_failed entries: label_sync's
-- dbMsgIds query (gmail-migration-worker, gmail-sync-recovery-worker,
-- gmail-label-sync-worker's fast path) selected project_emails without a
-- user_id filter, so a project with N members handed applyLabel N-1/N of
-- its ids belonging to OTHER members' mailboxes -- Gmail message ids are
-- per-mailbox, so every one of those calls 404'd ("Requested entity was
-- not found"), forever, every tick, since a 404'd id never joins
-- gmailMsgSet/confirmed_applied_ids and so is never excluded from the next
-- tick's toApply. Fixed in the three edge functions (scoped the query to
-- .eq('user_id', userId) / grouped per-user before dispatch).
--
-- This requeues the label_sync jobs that got stuck under the old, buggy
-- code so they retry immediately under the fix instead of sitting in
-- persistent_failure until their next natural pickup.
-- confirmed_applied_ids is left untouched -- those are genuinely successful
-- applies from before this fix (a foreign id essentially never returns a
-- 200), no reason to discard that progress and redo it.
UPDATE gmail_migration_jobs
SET status = 'pending', attempts = 0, consecutive_stall_count = 0, updated_at = now()
WHERE status = 'persistent_failure' AND job_type = 'label_sync';
