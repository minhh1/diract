-- Definitive idempotency guard for cross-mailbox Gmail message imports.
--
-- Three separate functions can independently decide to import a message
-- into a target user's mailbox: gmail-email-sync-processor,
-- gmail-sync-recovery-worker, and (for real-time backfill) gmail-push. Each
-- only coordinated via a per-user Gmail-account lock (acquire_gmail_user_lock)
-- and by re-reading the target's live Gmail label state before importing --
-- both are soft signals with real gaps (lock TTL edges, Gmail's own listing
-- lag right after an import, or simply two different dispatchers racing).
-- Confirmed live: fixing the "single blanket source" bug in
-- gmail-email-sync-processor (see the corresponding code change) let a
-- previously-stuck backlog run for the first time, and several messages were
-- imported into a real user's mailbox 2-4 times each within seconds of each
-- other.
--
-- This table makes "have I already imported message X for user Y" a single
-- atomic DB claim instead of a live Gmail check: whichever caller's INSERT
-- wins proceeds with the import; every other caller (this tick or a
-- concurrent one) gets a unique-violation and skips, unconditionally, with
-- no dependency on timing or which function got there first.
CREATE TABLE IF NOT EXISTS gmail_import_claims (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gmail_message_id)
);

ALTER TABLE gmail_import_claims ENABLE ROW LEVEL SECURITY;

-- Service-role only (the three edge functions above all use the service
-- role client) -- no browser client ever needs to read or write this table.
DROP POLICY IF EXISTS gmail_import_claims_service_only ON gmail_import_claims;
CREATE POLICY gmail_import_claims_service_only ON gmail_import_claims
  FOR ALL USING (false) WITH CHECK (false);
