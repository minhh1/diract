-- Corrects the previous fix (treating a zero-progress deferral as a real
-- attempt): that used the SAME `attempts` counter real API errors already
-- use, cumulatively, over the item's entire multi-hour history -- so a job
-- that genuinely progressed on tick 1 but then hit a rough patch on ticks
-- 2/3/4 still escalated to persistent_failure after 3 zero-progress ticks
-- total, even though it wasn't actually stuck forever. Confirmed live: 24
-- jobs escalated within ~20 minutes of deploying that fix, every single one
-- of them a large-but-otherwise-healthy (300-365 message) job, not the
-- handful of genuinely-never-progressing ones it was meant to catch --  and
-- the count kept climbing afterward instead of settling.
--
-- This is a SEPARATE counter, own threshold, own reset condition: it only
-- increments on a zero-progress deferral, and resets to 0 the instant a
-- tick makes ANY real progress (even one message). `attempts` (real thrown
-- errors) is untouched and keeps its own independent MAX_ATTEMPTS
-- escalation exactly as before. Only a truly consecutive run of
-- STALL_THRESHOLD zero-progress ticks -- no progress at all in between --
-- now escalates to persistent_failure.
ALTER TABLE gmail_migration_jobs ADD COLUMN IF NOT EXISTS consecutive_stall_count int NOT NULL DEFAULT 0;
ALTER TABLE gmail_sync_failures ADD COLUMN IF NOT EXISTS consecutive_stall_count int NOT NULL DEFAULT 0;

-- Give the 27 jobs wrongly escalated by the previous (cumulative) version
-- of this logic a fair shot under the corrected one, instead of leaving
-- them stranded in persistent_failure needing manual admin intervention.
UPDATE gmail_migration_jobs
SET status = 'pending', attempts = 0, consecutive_stall_count = 0, updated_at = now()
WHERE status = 'persistent_failure';
