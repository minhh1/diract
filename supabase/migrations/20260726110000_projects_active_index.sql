-- Speeds up "active matters" lookups as the table grows -- closed matters
-- are considered inactive (projects.status = 'Closed'), so this partial
-- index only covers the rows most queries actually care about. Same shape
-- as projects_needs_review_idx (properties_projects_needs_review
-- migration). IS DISTINCT FROM, not <>, so NULL-status projects (the
-- common case for matters that predate any status being set -- see
-- lib/gmail/archiveProject.ts's comment on this same gotcha) count as
-- active rather than being silently excluded from both sides.
CREATE INDEX IF NOT EXISTS projects_active_idx
  ON projects (company_id)
  WHERE status IS DISTINCT FROM 'Closed';
