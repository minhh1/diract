SET request.jwt.claim.role = 'service_role';

-- Adds an optional start date to tasks so the Finance Model Timeline
-- subtab's Gantt view can plot a real start -> due duration bar (rather
-- than a single-day marker) for tasks that have one set. Company-wide
-- (every customer's tasks table gets this column), but purely additive --
-- nullable, no existing behaviour changes for tasks without one.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date date;
