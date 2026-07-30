-- Re-creates the three partial unique indexes 20260729000000_scoped_default_views.sql
-- was supposed to add. Confirmed live: none of them actually existed on
-- production (pg_constraint showed only the primary key + FKs + the scope
-- check constraint) despite that migration being recorded as applied and
-- no later migration touching this table.
--
-- IF NOT EXISTS makes this safe to run regardless of whatever partial
-- state the original migration left behind. (These indexes turned out not
-- to be usable as PostgREST upsert conflict targets anyway -- see
-- 20260731150100_fix_default_views_conflict_target.sql, which supersedes
-- this with a full constraint instead. Left as-is since it already ran.)
create unique index if not exists uq_company_default_views_company
  on company_default_views (company_id, table_slug)
  where team_id is null and user_id is null;
create unique index if not exists uq_company_default_views_team
  on company_default_views (company_id, table_slug, team_id)
  where team_id is not null;
create unique index if not exists uq_company_default_views_user
  on company_default_views (company_id, table_slug, user_id)
  where user_id is not null;
