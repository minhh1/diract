-- New public_task_pages.scope value, creatable only from a dashboard's
-- "public task page" widget (see lib/dashboardWidgets/types.ts's
-- PublicTaskPageWidget), not the Settings -> Public task pages form.
-- Private to its own creator exactly like 'self' (see
-- lib/publicTaskPageAuth.ts), but additionally surfaces unallocated tasks
-- and lets the viewer assign a new task to anyone in the company, not just
-- themself (see app/api/public-tasks/[pageId]/route.ts).
ALTER TABLE public_task_pages DROP CONSTRAINT IF EXISTS public_task_pages_scope_check;
ALTER TABLE public_task_pages ADD CONSTRAINT public_task_pages_scope_check
  CHECK (scope IN ('self', 'team', 'company', 'my_and_unassigned'));
