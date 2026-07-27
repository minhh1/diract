-- Staff can manually append an email reference to a matter -- distinct
-- from client_update_page_notes (free text): this has structured
-- subject/sender/date fields, and lib/ai/matterEmailSummary.ts reads it
-- alongside the real Gmail-synced project_emails when generating the "where
-- is this matter up to" AI summary, so logging an email here actually
-- feeds that. Deliberately NOT project_emails itself -- that table's
-- user_id is NOT NULL (every row is tied to whichever staff member's
-- mailbox synced it for real), so a manually-logged entry that isn't from
-- anyone's live Gmail sync has no legitimate value to put there.
CREATE TABLE IF NOT EXISTS client_update_page_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES client_update_page_items(id) ON DELETE CASCADE,
  subject text,
  from_name text,
  from_address text,
  snippet text,
  email_date date NOT NULL DEFAULT CURRENT_DATE,
  added_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_update_page_emails_item_id_idx ON client_update_page_emails(item_id);

ALTER TABLE client_update_page_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_emails_company_members ON client_update_page_emails;
CREATE POLICY client_update_page_emails_company_members ON client_update_page_emails
  FOR ALL
  USING (item_id IN (
    SELECT i.id FROM client_update_page_items i
    JOIN client_update_pages p ON p.id = i.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (item_id IN (
    SELECT i.id FROM client_update_page_items i
    JOIN client_update_pages p ON p.id = i.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
