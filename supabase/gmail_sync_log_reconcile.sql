-- gmail_activity_log was added in error, duplicating the pre-existing
-- gmail_sync_log table (written by assign/remove-label/addon routes since
-- before this table existed, 5,900+ real rows). Consolidating onto
-- gmail_sync_log instead of running two parallel logs — see edits to
-- gmail-label-sync-worker, gmail-email-sync-worker, gmail-push, and
-- AdminGmailSyncTab.tsx in the same change.
DROP TABLE IF EXISTS gmail_activity_log;
