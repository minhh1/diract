-- tasks.category / checklist_template_items.category: free-typed phase
-- label (e.g. "Acquisition", "Construction") used purely for grouping the
-- Gantt into swimlanes -- it doesn't drive scheduling, that's still the
-- existing due_anchor/start_anchor chain (see start_task_<n> below).
alter table tasks add column if not exists category text;
alter table checklist_template_items add column if not exists category text;

-- tasks.source_template_item_id: loose reference (no FK, same convention
-- as budget_lines.linked_task_id) back to the checklist_template_items row
-- a task was created from, so edits made to a real task in the Gantt view
-- can be pushed back into the template that spawned it.
alter table tasks add column if not exists source_template_item_id uuid;
