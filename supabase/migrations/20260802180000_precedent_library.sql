-- Turns `precedents` from a short hand-made per-firm list into a navigable
-- library. Before this, a precedent had only name/description/display_order
-- and components/dashboard/tabs/PrecedentsTab.tsx rendered one flat list --
-- fine for the 2 rows a firm typed in by hand, unusable at the ~300 the
-- seeded Australian law-firm library ships (see lib/precedents/library/).
--
-- Two things drive the columns below:
--
-- 1. Navigation. A matter only ever needs a handful of these, so the tab
--    filters by the matter's own matter_type (+ state where known) and
--    groups the rest by category, rather than listing everything.
--
-- 2. Jurisdiction without a combinatorial explosion. Australian law is
--    state-based, but most documents (costs agreements, letters of demand,
--    Calderbank offers, client advices) are substantially identical across
--    states. Those get ONE row with jurisdictions = NULL, meaning "applies
--    everywhere". Only genuinely divergent documents (conveyancing
--    disclosure/duty, court forms, personal-injury pre-litigation regimes,
--    probate) get per-state rows. NULL-means-all is what keeps this ~300
--    rows instead of ~2,000.

ALTER TABLE precedents
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  -- NULL = applies in every jurisdiction. Non-null lists the states it's
  -- written for, e.g. '{NSW}'. Not a CHECK constraint -- territories (ACT,
  -- NT) aren't seeded yet but a firm may add their own.
  ADD COLUMN IF NOT EXISTS jurisdictions text[],
  -- Mirrors the projects.matter_type select options seeded by the law-firm
  -- template ('Conveyancing', 'Family Law', ...). NULL = show for any
  -- matter type.
  ADD COLUMN IF NOT EXISTS matter_types text[],
  ADD COLUMN IF NOT EXISTS document_type text,
  -- Court filings use prescribed forms that differ per court and change
  -- over time, so a seeded scaffold is a drafting aid, never a
  -- known-current form. This drives a visible badge rather than leaving
  -- that caveat undocumented in the UI.
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_note text,
  -- Stable slug for a seeded precedent, e.g. 'debt.letter_of_demand'.
  -- NULL for anything a firm creates by hand. Makes re-running the seed an
  -- upsert instead of a duplicator, so the library can grow over time
  -- without cloning what a firm already has.
  ADD COLUMN IF NOT EXISTS library_key text;

-- Partial unique: only seeded rows carry a library_key, and only live ones
-- should block a re-seed (a soft-deleted precedent shouldn't stop the same
-- library_key being reinstalled).
CREATE UNIQUE INDEX IF NOT EXISTS precedents_company_library_key_idx
  ON precedents(company_id, library_key)
  WHERE library_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS precedents_company_category_idx
  ON precedents(company_id, record_table, category)
  WHERE deleted_at IS NULL;
