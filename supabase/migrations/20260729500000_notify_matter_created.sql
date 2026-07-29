-- Notifies company admins whenever a new project/matter is created --
-- creation is scattered across at least 4 independent paths
-- (components/NewProjectModal.tsx, lib/ai/actions.ts's createProject,
-- the Gmail add-on's create-project route, and the bulk-import pipeline's
-- auto-create-parent path), so -- same reasoning as task_assigned and
-- team_member_joined -- a DB trigger on the table itself is the only
-- reliable single chokepoint.
CREATE OR REPLACE FUNCTION notify_matter_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_company_admins(
    NEW.company_id,
    'matter_created',
    'New matter: ' || NEW.name,
    NULL,
    '/dashboard/projects?id=' || NEW.id::text,
    'projects',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_matter_created ON projects;
CREATE TRIGGER trg_notify_matter_created
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION notify_matter_created();
