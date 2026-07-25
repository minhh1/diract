-- Adds an `error` column (parity with the old gmail_archive_requests table's
-- `error` field -- so a failed approve attempt, e.g. "no active label found",
-- stays visible on the request instead of silently leaving it pending with
-- no explanation) and one-time migrates any still-pending gmail_archive_requests
-- rows into the unified archive_requests table as entity_table =
-- 'gmail_project_archive' -- see app/api/archive-requests/approve/route.ts,
-- which special-cases that entity_table to call enqueueProjectArchive()
-- instead of the generic deleted_at soft-delete every other entity_table gets.
--
-- gmail_archive_requests itself is left in place (not dropped) -- historical
-- approved/rejected rows stay queryable there; only pending ones are migrated,
-- since those are the only ones a future admin action could still act on.

ALTER TABLE archive_requests ADD COLUMN IF NOT EXISTS error text;

INSERT INTO archive_requests (company_id, entity_table, entity_id, entity_label, requested_by, status, created_at)
SELECT
  gar.company_id,
  'gmail_project_archive',
  gar.project_id,
  COALESCE(p.name, 'Untitled project'),
  gar.requested_by,
  'pending',
  gar.created_at
FROM gmail_archive_requests gar
LEFT JOIN projects p ON p.id = gar.project_id
WHERE gar.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM archive_requests ar
    WHERE ar.entity_table = 'gmail_project_archive' AND ar.entity_id = gar.project_id AND ar.status = 'pending'
  );
