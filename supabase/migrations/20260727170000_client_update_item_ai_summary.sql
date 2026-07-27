-- Cached one-sentence AI summary of "where a matter is up to," shown as a
-- second line under the matter name in Client Update Pages' card view.
-- Generated on demand by a staff action (see
-- app/api/client-update-pages/[id]/items/[itemId]/summarize/route.ts),
-- never automatically on page load -- this page is PIN-gated but otherwise
-- unauthenticated, so triggering a paid AI call on every anonymous view
-- would be an open cost/abuse surface. The cached value is shown to both
-- staff and the client once generated.
ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS ai_summary_generated_at timestamptz;
