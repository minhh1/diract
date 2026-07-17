ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION set_task_completed_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_completed THEN
      NEW.completed_at = now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_completed AND NOT OLD.is_completed THEN
      NEW.completed_at = now();
    ELSIF NOT NEW.is_completed AND OLD.is_completed THEN
      NEW.completed_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_task_completed_at ON tasks;
CREATE TRIGGER trg_set_task_completed_at
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();
