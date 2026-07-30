-- Every upsert in the app (usePresetTable.ts, useTableColumnConfig.ts,
-- AdminDefaultViewsTab.tsx) targets company_default_views' three PARTIAL
-- unique indexes (from 20260729000000_scoped_default_views.sql, re-created
-- by 20260731150000_fix_missing_default_views_indexes.sql after being
-- found missing) with a plain `on_conflict=company_id,table_slug` (or
-- `...,team_id` / `...,user_id`). Postgres can only use a PARTIAL index as
-- an ON CONFLICT arbiter when the same WHERE predicate is repeated in the
-- ON CONFLICT clause itself, which PostgREST's upsert(onConflict: '...')
-- has no mechanism to express. Confirmed live: even a raw
--   INSERT ... ON CONFLICT (company_id, table_slug) DO UPDATE ...
-- against this table fails with 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") regardless of whether the
-- partial indexes exist -- every column/sort layout save has been silently
-- no-op'ing since this table's scoping shipped (the client never checked
-- the upsert's error), which is what surfaced as "my saved sort resets on
-- reload": the local optimistic state looked saved, nothing ever
-- persisted, so the next load had nothing to restore and fell back to
-- default.
--
-- Fix: one full (non-partial) constraint instead of three partial ones,
-- using NULLS NOT DISTINCT (Postgres 15+) so (company_id, table_slug,
-- NULL, NULL) -- the company-wide row -- is still correctly treated as a
-- single conflicting tuple. Ordinary UNIQUE would NOT enforce that
-- (Postgres treats every NULL as distinct from every other NULL by
-- default), which is exactly why the original design reached for three
-- partial indexes instead -- this achieves the same three-way scoping
-- without needing a predicate an ON CONFLICT clause can't repeat. The
-- corresponding client-side onConflict targets are updated in the same
-- change that ships this migration.
drop index if exists uq_company_default_views_company;
drop index if exists uq_company_default_views_team;
drop index if exists uq_company_default_views_user;

alter table company_default_views
  add constraint uq_company_default_views_scope
  unique nulls not distinct (company_id, table_slug, team_id, user_id);
