-- Lets a team be tagged with the free-typed task/template `category` values
-- (e.g. "Construction", "Fixing Stage") it owns, so the Timeline/Templates
-- category input can auto-suggest that team once a matching category is
-- entered -- see AdminTeamsTab.tsx for where this is managed and
-- TimelineSubtab.tsx/TemplateManager.tsx for where it's read.
alter table teams add column if not exists category_tags text[];
