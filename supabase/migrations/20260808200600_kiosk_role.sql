-- Adds 'kiosk' to the company_role enum used by both company_memberships.role
-- and profiles.role -- a non-human, admin-created account for a shared
-- device (e.g. an iPad at a work location) that should see nothing in the
-- app except a designated calendar/roster view and a check-in panel. Must
-- run as its own migration/transaction: Postgres forbids using a newly
-- added enum value in the same transaction it was added in, so every
-- later migration that references 'kiosk' (RLS policies, defaults, etc.)
-- has to land in a later file.
SET request.jwt.claim.role = 'service_role';

ALTER TYPE company_role ADD VALUE IF NOT EXISTS 'kiosk';
