SET request.jwt.claim.role = 'service_role';

-- Lets a demo hub leave specific things out. A hub otherwise exposes
-- EVERY active board / Finance Model page / solver page for its company,
-- which is the point (one link, everything) -- but a company will often
-- have an internal board that shouldn't go in front of a prospect, so
-- exclusion has to be possible without deactivating the board itself for
-- real staff use.
--
-- Stored as the board slug / page id, matched against the same keys the
-- hub API already emits. Defaults to empty: existing hubs keep showing
-- everything.
ALTER TABLE public_demo_hubs ADD COLUMN IF NOT EXISTS excluded_keys text[] NOT NULL DEFAULT '{}';
