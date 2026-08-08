-- Phase 1 of first-party company messaging (Slack/Teams-style): channels,
-- DMs, threads, reactions, @mentions/#channel refs. Built on both the web
-- app (lib/services/messaging.ts) and the mobile app (mobile/src/lib/
-- messaging.ts) via direct RLS-gated Supabase writes -- no Next.js API
-- route sits in front of this, unlike the AI table-builder, since none of
-- these operations need a server-side secret or third-party call.
--
-- channels.type distinguishes a named public/private channel from a DM
-- (no `name`/`slug` on a DM -- its display name is derived client-side from
-- participants). is_private exists now (schema-ready) even though nothing
-- in this phase's UI can set it true yet -- confirmed with the user:
-- "any member creates channels, public by default," private channels as a
-- later fast-follow. Building the RLS to already respect is_private costs
-- nothing extra now and avoids a security-relevant RLS migration later.
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'channel' CHECK (type IN ('channel', 'dm')),
  name text,
  slug text,
  topic text,
  is_private boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT channels_name_shape CHECK (
    (type = 'channel' AND name IS NOT NULL) OR (type = 'dm' AND name IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS channels_company_idx ON channels (company_id) WHERE deleted_at IS NULL;
-- Slug uniqueness only matters for real channels (DMs never have one) and
-- only among live rows -- same partial-unique-index shape as
-- company_tables_company_id_slug_live_key, so an archived channel's name
-- can be reused.
CREATE UNIQUE INDEX IF NOT EXISTS channels_company_slug_live_key
  ON channels (company_id, slug) WHERE deleted_at IS NULL AND slug IS NOT NULL;

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS channel_members_user_idx ON channel_members (user_id);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  -- Denormalized from channels.company_id, same convention as
  -- finance_model_attachments -- lets every RLS policy on this table do a
  -- direct company_id = active_company_id() check without an extra join.
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  -- NULL = top-level channel message; set = a threaded reply. Self-FK, one
  -- level deep only (a reply's parent is always a top-level message -- the
  -- composer never lets you reply to a reply, matching Slack's own model).
  parent_message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  -- Populated by the inserting client from @[Name](uuid) tokens in body --
  -- see lib/services/messaging.ts's sendMessage / mobile/src/lib/messaging.ts's
  -- equivalent. Read by notify_message_participants() below to fan out
  -- notifications regardless of which client wrote the row.
  mentioned_user_ids uuid[],
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_channel_created_idx ON messages (channel_id, created_at) WHERE parent_message_id IS NULL;
CREATE INDEX IF NOT EXISTS messages_parent_idx ON messages (parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_company_idx ON messages (company_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  -- Denormalized from messages.channel_id, same reasoning as messages'
  -- own company_id denormalization -- lets a realtime subscription scope
  -- directly by channel_id=eq.<openChannelId> (see lib/hooks/useTableRealtime.ts's
  -- single-column filter limit) instead of needing a join Realtime can't do.
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions (message_id);
CREATE INDEX IF NOT EXISTS message_reactions_channel_idx ON message_reactions (channel_id);

-- Keeps channel_id in sync with the parent message automatically, so
-- neither client has to pass it explicitly on every reaction insert (one
-- less thing both the web and mobile insert calls need to get right).
CREATE OR REPLACE FUNCTION set_message_reaction_channel_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT channel_id INTO NEW.channel_id FROM messages WHERE id = NEW.message_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_reactions_set_channel_id ON message_reactions;
CREATE TRIGGER message_reactions_set_channel_id
  BEFORE INSERT ON message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION set_message_reaction_channel_id();

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- ── Shared visibility predicate ──────────────────────────────────────────
-- A public (non-private) channel is visible to any member of the company
-- it belongs to; a private channel or DM is visible only to its explicit
-- channel_members. Used by messages/channel_members/message_reactions'
-- policies below. Not used by channels' OWN select policy (written inline
-- instead, to avoid a SECURITY DEFINER function querying the very table
-- its policy is attached to).
CREATE OR REPLACE FUNCTION can_access_channel(p_channel_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = p_channel_id
      AND c.company_id = active_company_id()
      AND c.deleted_at IS NULL
      AND (
        (c.type = 'channel' AND NOT c.is_private)
        OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = auth.uid())
      )
  );
$$;

-- ── channels policies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS channels_select ON channels;
CREATE POLICY channels_select ON channels
  FOR SELECT
  USING (
    company_id = active_company_id() AND deleted_at IS NULL AND (
      (type = 'channel' AND NOT is_private)
      OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = channels.id AND cm.user_id = auth.uid())
    )
  );

-- Any company member can create a channel (confirmed default) or start a DM.
DROP POLICY IF EXISTS channels_insert ON channels;
CREATE POLICY channels_insert ON channels
  FOR INSERT
  WITH CHECK (company_id = active_company_id() AND created_by = auth.uid());

-- Rename/topic/archive: creator or admin only.
DROP POLICY IF EXISTS channels_update ON channels;
CREATE POLICY channels_update ON channels
  FOR UPDATE
  USING (company_id = active_company_id() AND (created_by = auth.uid() OR is_current_user_admin()))
  WITH CHECK (company_id = active_company_id() AND (created_by = auth.uid() OR is_current_user_admin()));

-- No delete policy -- archiving is a soft delete via UPDATE (deleted_at),
-- same convention as company_tables/company_dashboards.

-- ── channel_members policies ─────────────────────────────────────────
DROP POLICY IF EXISTS channel_members_select ON channel_members;
CREATE POLICY channel_members_select ON channel_members
  FOR SELECT
  USING (can_access_channel(channel_id));

-- A member can add themself (joining a public channel); the channel/DM
-- creator can add other initial members (DM participants, or inviting
-- someone into a private channel later).
DROP POLICY IF EXISTS channel_members_insert ON channel_members;
CREATE POLICY channel_members_insert ON channel_members
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND c.company_id = active_company_id() AND c.created_by = auth.uid())
  );

-- Bumping last_read_at is the only update this phase needs, and it's
-- always the row owner doing it.
DROP POLICY IF EXISTS channel_members_update ON channel_members;
CREATE POLICY channel_members_update ON channel_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS channel_members_delete ON channel_members;
CREATE POLICY channel_members_delete ON channel_members
  FOR DELETE
  USING (user_id = auth.uid() OR is_current_user_admin());

-- ── messages policies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT
  USING (company_id = active_company_id() AND can_access_channel(channel_id));

DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages
  FOR INSERT
  WITH CHECK (company_id = active_company_id() AND user_id = auth.uid() AND can_access_channel(channel_id));

-- Edit (own message) or moderate-delete (admin, sets deleted_at not a real
-- DELETE -- same soft-delete convention as every other entity here).
DROP POLICY IF EXISTS messages_update ON messages;
CREATE POLICY messages_update ON messages
  FOR UPDATE
  USING (company_id = active_company_id() AND (user_id = auth.uid() OR is_current_user_admin()))
  WITH CHECK (company_id = active_company_id() AND (user_id = auth.uid() OR is_current_user_admin()));

-- ── message_reactions policies ───────────────────────────────────────
-- channel_id lives directly on the row (set by the BEFORE INSERT trigger
-- below), so these read can_access_channel() directly without a join to
-- messages -- that function already fully validates company + channel
-- access, so no separate company_id check is needed here either.
DROP POLICY IF EXISTS message_reactions_select ON message_reactions;
CREATE POLICY message_reactions_select ON message_reactions
  FOR SELECT
  USING (can_access_channel(channel_id));

DROP POLICY IF EXISTS message_reactions_insert ON message_reactions;
CREATE POLICY message_reactions_insert ON message_reactions
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND can_access_channel(channel_id));

DROP POLICY IF EXISTS message_reactions_delete ON message_reactions;
CREATE POLICY message_reactions_delete ON message_reactions
  FOR DELETE
  USING (user_id = auth.uid());

-- ── Auto-join the creator ────────────────────────────────────────────
-- A channel/DM with no membership row for its own creator would never show
-- up in their own sidebar -- guaranteed at the DB layer rather than relying
-- on both client implementations (web + mobile) to remember a second
-- insert every time.
CREATE OR REPLACE FUNCTION add_channel_creator_as_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO channel_members (channel_id, user_id, joined_at, last_read_at)
    VALUES (NEW.id, NEW.created_by, now(), now())
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channels_add_creator_as_member ON channels;
CREATE TRIGGER channels_add_creator_as_member
  AFTER INSERT ON channels
  FOR EACH ROW
  EXECUTE FUNCTION add_channel_creator_as_member();

-- ── @mention / DM notifications ──────────────────────────────────────
-- Fires for a row written by EITHER client (web direct-insert or mobile
-- direct-insert) -- notification fan-out only depends on the row's own
-- columns, not on which app wrote it. Reuses create_notification() exactly
-- like the existing task_assigned trigger
-- (20260729470000_notify_task_assigned_via_create_notification.sql).
CREATE OR REPLACE FUNCTION notify_message_participants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mentioned_id uuid;
  v_channel channels;
  v_sender_name text;
  v_link text;
  v_dm_member uuid;
BEGIN
  SELECT * INTO v_channel FROM channels WHERE id = NEW.channel_id;
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.user_id;
  v_link := '/dashboard/messaging?channel=' || NEW.channel_id::text || '&message=' || NEW.id::text;

  IF NEW.mentioned_user_ids IS NOT NULL THEN
    FOREACH v_mentioned_id IN ARRAY NEW.mentioned_user_ids LOOP
      IF v_mentioned_id IS DISTINCT FROM NEW.user_id THEN
        PERFORM create_notification(
          NEW.company_id, v_mentioned_id, 'message_mentioned',
          COALESCE(v_sender_name, 'Someone') || ' mentioned you' || CASE WHEN v_channel.name IS NOT NULL THEN ' in #' || v_channel.name ELSE '' END,
          left(NEW.body, 200), v_link, 'messages', NEW.id
        );
      END IF;
    END LOOP;
  END IF;

  -- DMs notify on every message, not just mentions -- but skip anyone
  -- already notified above so a DM message that also happens to contain an
  -- @mention token doesn't double-notify the same person.
  IF v_channel.type = 'dm' THEN
    FOR v_dm_member IN SELECT user_id FROM channel_members WHERE channel_id = NEW.channel_id AND user_id != NEW.user_id LOOP
      IF NEW.mentioned_user_ids IS NULL OR NOT (v_dm_member = ANY(NEW.mentioned_user_ids)) THEN
        PERFORM create_notification(
          NEW.company_id, v_dm_member, 'message_dm',
          COALESCE(v_sender_name, 'Someone') || ' sent you a message',
          left(NEW.body, 200), v_link, 'messages', NEW.id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_after_insert ON messages;
CREATE TRIGGER messages_notify_after_insert
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_message_participants();
