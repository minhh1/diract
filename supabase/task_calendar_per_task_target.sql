ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_target text NOT NULL DEFAULT 'tasks_calendar';
