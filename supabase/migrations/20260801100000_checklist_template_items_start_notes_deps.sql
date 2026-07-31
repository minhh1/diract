SET request.jwt.claim.role = 'service_role';

-- Extends the existing checklist_template_items table (live-only, powers
-- the Checklist tab's "Apply template" flow -- see
-- components/dashboard/TemplateManager.tsx) with three additive columns,
-- reused by the new Timeline/Gantt "Apply template" action this migration
-- batch adds:
--   start_offset_days/start_anchor -- mirrors the existing due_offset_days/
--     due_anchor exactly, so an applied template can populate tasks.start_date
--     as well as due_date (real Gantt duration bars, not just a due-date
--     marker). Nullable -- a template item with no start offset behaves
--     exactly as it does today (due-date only).
--   notes -- carries a template item's explanatory guidance through to the
--     created task's own notes field. Nothing wrote this before.
--   depends_on_item_ids -- uuid[] of other checklist_template_items.id in
--     the SAME template, resolved into real task_dependencies rows
--     (supabase/task_dependencies.sql, already exists) at apply time by
--     mapping template-item ids to the newly-created task ids -- mirrors how
--     due_anchor's `task_<n>` chaining already resolves same-template
--     references, just for blocking relationships instead of date offsets.
ALTER TABLE checklist_template_items ADD COLUMN IF NOT EXISTS start_offset_days integer;
ALTER TABLE checklist_template_items ADD COLUMN IF NOT EXISTS start_anchor text;
ALTER TABLE checklist_template_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE checklist_template_items ADD COLUMN IF NOT EXISTS depends_on_item_ids uuid[];
