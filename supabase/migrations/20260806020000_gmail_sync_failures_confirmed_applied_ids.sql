-- Same fix as 20260806010000_gmail_migration_confirmed_applied_ids.sql,
-- mirrored onto gmail_sync_failures -- gmail-sync-recovery-worker shares
-- the identical "re-derive toApply from a fresh Gmail list read every
-- tick" architecture, so it's exposed to the same list-endpoint
-- consistency issue even though it wasn't the one observed live.
ALTER TABLE gmail_sync_failures ADD COLUMN IF NOT EXISTS confirmed_applied_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
