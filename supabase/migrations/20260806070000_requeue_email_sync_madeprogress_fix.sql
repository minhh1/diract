-- Follow-up to 20260806060000: that fix correctly persisted
-- confirmed_applied_ids for an already-claimed (already-imported) message,
-- but forgot to set madeProgressThisTick -- so a tick whose only
-- advancement was resolving already-claimed ids still counted as a
-- zero-progress stall to the outer consecutive-stall detector. Confirmed
-- live: job 9d3e4b18 (33 Moore Street/kdang) had confirmed_applied_ids
-- genuinely grow from 0 to 65 of 235 across its "3 consecutive stall"
-- ticks, then got wrongly escalated to persistent_failure anyway. Fixed in
-- both gmail-migration-worker and gmail-sync-recovery-worker; this
-- requeues the (small, 6-job) batch caught by that gap.
UPDATE gmail_migration_jobs
SET status = 'pending', attempts = 0, consecutive_stall_count = 0, updated_at = now()
WHERE status = 'persistent_failure' AND job_type = 'email_sync';
