-- Third bug in the same email_sync loop, distinct from the previous two:
-- when a message's filer has no usable Gmail connection (most commonly a
-- removed/disconnected member -- see app/api/admin/members' token cleanup),
-- there is no mailbox left to import from, but the code did a bare
-- `continue` with nothing recorded, so every tick re-ran a real
-- userHasMessage network call on that id forever. Confirmed live
-- 2026-08-06: 25 such orphaned-filer messages on "33 Moore Street" (filed
-- by a member removed earlier this session) were enough on their own to
-- keep tripping the consecutive-stall detector even though the item's
-- other ~200 messages were resolving fine. Company-wide this affects 34
-- projects (some with 100+ orphaned messages), so this is a broad, not
-- narrow, fix. Recording it resolved (confirmed_applied_ids) mirrors the
-- already-claimed-import fix from 20260806060000/070000.
--
-- Requeues the jobs already stuck under the old behavior; every other
-- pending email_sync job picks up the fix on its own next tick without
-- needing a reset.
UPDATE gmail_migration_jobs
SET status = 'pending', attempts = 0, consecutive_stall_count = 0, updated_at = now()
WHERE status = 'persistent_failure' AND job_type = 'email_sync';

UPDATE gmail_sync_failures
SET status = 'pending_retry', attempts = 0, consecutive_stall_count = 0
WHERE status = 'persistent_failure' AND job_type = 'email_sync';
