-- Staff's Status-checkbox selection persists as this (top-level) group's
-- page-wide default -- applies to everyone (staff and every client) who
-- hasn't set their own override. NULL = never configured, fall back to
-- auto-selecting "In Progress" if present; an empty array is a deliberate
-- "show everything by default" choice and does NOT fall back. Names, not
-- subgroup ids, since ids differ per group but names (In Progress/Settled/
-- Terminated) are consistent -- see MatterBoard.tsx's resolveNames.
ALTER TABLE client_update_groups ADD COLUMN IF NOT EXISTS default_status_names text[];
