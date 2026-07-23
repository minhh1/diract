-- Distinguishes a follow-up logged as already done from one scheduled for
-- a future date (not done yet — gets a tick when it's actually followed
-- up on). Existing rows default true since they were all logged as
-- already-done under the old, single-purpose behavior.
ALTER TABLE task_follow_ups ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT true;
