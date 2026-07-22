-- Manual override for which "organised view" bucket a task sits in on the
-- public task page (action / follow_up / watcher). Null means auto-detect.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_group text;
