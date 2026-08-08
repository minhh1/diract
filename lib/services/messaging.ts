// lib/services/messaging.ts
// Direct, RLS-gated Supabase read/write helpers for company messaging
// (channels, DMs, threads, reactions) -- no Next.js API route sits in front
// of these, unlike the AI table-builder, since none of these operations
// need a server-side secret or third-party call (see the messaging plan's
// Architecture section). Mobile has its own parallel implementation against
// the same schema (mobile/src/lib/messaging.ts) -- there's no shared code
// path between the two codebases, only the shared tables/RLS/realtime.
import { supabase } from "@/lib/supabase";

export interface Channel {
  id: string;
  company_id: string;
  type: "channel" | "dm";
  name: string | null;
  slug: string | null;
  topic: string | null;
  is_private: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  company_id: string;
  user_id: string;
  body: string;
  parent_message_id: string | null;
  mentioned_user_ids: string[] | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

// Matches the composer's inserted tokens: @[Full Name](<uuid>) for a person,
// #[channel-name](<uuid>) for a channel reference. Deliberately explicit
// uuid-bearing tokens, not free-text name matching -- a plain "@John" breaks
// the moment two Johns exist or someone renames themselves.
const MENTION_TOKEN_RE = /@\[[^\]]+\]\(([0-9a-f-]{36})\)/gi;
const CHANNEL_REF_TOKEN_RE = /#\[[^\]]+\]\(([0-9a-f-]{36})\)/gi;

export function parseMentionedUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN_RE)) ids.add(match[1]);
  return Array.from(ids);
}

export function parseReferencedChannelIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(CHANNEL_REF_TOKEN_RE)) ids.add(match[1]);
  return Array.from(ids);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

// Public channel, any member -- confirmed default (private channels are
// schema-ready but have no UI to create one yet). The creator becomes a
// channel_members row automatically via the DB trigger, not here.
export async function createChannel(
  companyId: string,
  userId: string,
  name: string,
  topic?: string
): Promise<{ channel: Channel | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { channel: null, error: "Name is required" };

  const baseSlug = slugify(trimmed);
  let slug = baseSlug;
  let suffix = 1;
  // Same collision-retry shape as lib/ai/tableBuilderTools.ts's createTable
  // -- the DB has a partial unique index on (company_id, slug), so a human
  // typing a name that collides gets a usable channel instead of a raw
  // Postgres error.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await supabase
      .from("channels")
      .select("id")
      .eq("company_id", companyId)
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data, error } = await supabase
    .from("channels")
    .insert({ company_id: companyId, type: "channel", name: trimmed, slug, topic: topic || null, created_by: userId })
    .select()
    .single();

  return { channel: data as Channel | null, error: error?.message ?? null };
}

// Finds an existing 1:1 DM between the caller and otherUserId, or creates
// one. Group DMs (3+ people) aren't in this phase's scope.
export async function findOrCreateDm(
  companyId: string,
  userId: string,
  otherUserId: string
): Promise<{ channel: Channel | null; error: string | null }> {
  if (userId === otherUserId) return { channel: null, error: "Can't DM yourself" };

  // A DM channel this user belongs to; then check membership for exactly
  // {userId, otherUserId} (2 members, both present) client-side -- simpler
  // and clear enough at this scale than a single SQL round trip, and this
  // only runs when opening/starting a DM, not on every message.
  const { data: myDmChannels } = await supabase
    .from("channel_members")
    .select("channel_id, channels!inner(id, company_id, type)")
    .eq("user_id", userId)
    .eq("channels.company_id", companyId)
    .eq("channels.type", "dm");

  for (const row of myDmChannels ?? []) {
    const { data: members } = await supabase.from("channel_members").select("user_id").eq("channel_id", row.channel_id);
    const memberIds = new Set((members ?? []).map((m) => m.user_id));
    if (memberIds.size === 2 && memberIds.has(otherUserId)) {
      const { data: channel } = await supabase.from("channels").select("*").eq("id", row.channel_id).single();
      if (channel) return { channel: channel as Channel, error: null };
    }
  }

  const { data: created, error } = await supabase
    .from("channels")
    .insert({ company_id: companyId, type: "dm", created_by: userId })
    .select()
    .single();
  if (error || !created) return { channel: null, error: error?.message ?? "Failed to start DM" };

  // Creator is auto-added by the DB trigger; add the other participant.
  const { error: memberErr } = await supabase.from("channel_members").insert({ channel_id: created.id, user_id: otherUserId });
  if (memberErr) return { channel: null, error: memberErr.message };

  return { channel: created as Channel, error: null };
}

export async function sendMessage(
  channelId: string,
  companyId: string,
  userId: string,
  body: string,
  parentMessageId?: string | null
): Promise<{ message: Message | null; error: string | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { message: null, error: "Message can't be empty" };

  const mentionedUserIds = parseMentionedUserIds(trimmed);
  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      company_id: companyId,
      user_id: userId,
      body: trimmed,
      parent_message_id: parentMessageId ?? null,
      mentioned_user_ids: mentionedUserIds.length ? mentionedUserIds : null,
    })
    .select()
    .single();

  return { message: data as Message | null, error: error?.message ?? null };
}

export async function editMessage(messageId: string, body: string): Promise<{ error: string | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty" };
  const mentionedUserIds = parseMentionedUserIds(trimmed);
  const { error } = await supabase
    .from("messages")
    .update({ body: trimmed, edited_at: new Date().toISOString(), mentioned_user_ids: mentionedUserIds.length ? mentionedUserIds : null })
    .eq("id", messageId);
  return { error: error?.message ?? null };
}

// Soft delete -- the row (and its body) stays for admins/schema history-style
// audit, the UI renders a "message deleted" placeholder once deleted_at is set.
export async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
  return { error: error?.message ?? null };
}

// Toggle: adds the reaction if this user hasn't reacted with this emoji on
// this message yet, removes it if they have.
export async function toggleReaction(messageId: string, userId: string, emoji: string): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
  return { error: error?.message ?? null };
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  await supabase
    .from("channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", userId);
}

export async function joinChannel(channelId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("channel_members").insert({ channel_id: channelId, user_id: userId });
  return { error: error?.message ?? null };
}

export async function leaveChannel(channelId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("channel_members").delete().eq("channel_id", channelId).eq("user_id", userId);
  return { error: error?.message ?? null };
}
