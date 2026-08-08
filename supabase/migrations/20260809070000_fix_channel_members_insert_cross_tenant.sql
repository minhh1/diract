SET request.jwt.claim.role = 'service_role';

-- channel_members_insert (originally 20260809010000_company_messaging.sql,
-- widened by 20260809030000_company_messaging_phase2a.sql to let a
-- non-creator member or an admin invite someone) had two branches with no
-- correlation to the target channel's company at all -- confirmed live
-- with a real user JWT, not just read from the SQL:
--
--   1. `user_id = auth.uid()` -- the ORIGINAL comment's intent was "joining
--      a public channel", but the condition never actually checked the
--      channel was public, active-company-scoped, or even existed. Any
--      authenticated user could self-insert a channel_members row for ANY
--      channel_id anywhere on the platform -- another company's private
--      channel or DM included.
--
--   2. `is_current_user_admin()` -- correctly scoped to "admin of MY
--      active company" in isolation (see that function's own definition),
--      but used here as a bare condition with no check that channel_id's
--      OWN company matches. Any company admin could inject a membership
--      row -- for themself OR anyone else, user_id isn't constrained in
--      this branch either -- into ANY channel in ANY OTHER company.
--
-- phase2a's own comment claimed "can't be used to probe a private
-- channel's existence from outside it" -- true for the "existing member
-- invites" branch it was describing, but not for these other two, which
-- it left unchanged from the original migration.
--
-- Practical severity depends on 20260809040000/50000's profiles_update
-- fix also being in place (active_company_id() just reads
-- profiles.active_company_id, so reading anything back out of a channel
-- still requires matching active_company_id() separately) -- but this was
-- a real, unauthorized cross-tenant WRITE regardless: polluting another
-- tenant's private channel/DM membership list, independent of whether the
-- inserter could also read it.
DROP POLICY IF EXISTS channel_members_insert ON channel_members;
CREATE POLICY channel_members_insert ON channel_members
  FOR INSERT
  WITH CHECK (
    -- Self-join: only an actual PUBLIC channel in the caller's own active
    -- company -- the original "joining a public channel" intent, now
    -- actually enforced.
    (user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id AND c.company_id = active_company_id()
        AND c.type = 'channel' AND NOT c.is_private AND c.deleted_at IS NULL
    ))
    -- Creator invites anyone into their own channel (unchanged).
    OR EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND c.company_id = active_company_id() AND c.created_by = auth.uid())
    -- An existing member invites someone else (unchanged) -- safe
    -- transitively: the only way to legitimately hold a channel_members
    -- row in the first place is via one of these now-correctly-scoped
    -- branches.
    OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid())
    -- Admin invites anyone -- now also requires the channel is actually
    -- in the admin's own active company.
    OR (is_current_user_admin() AND EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_id AND c.company_id = active_company_id()
    ))
  );
