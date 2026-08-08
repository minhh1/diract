import { supabase } from '@/lib/supabase';

// Mobile's own implementation of company messaging (channels, DMs, threads,
// reactions, @mentions/#channel refs) against the exact same schema/RLS as
// the web app's lib/services/messaging.ts -- there's no shared code between
// the two codebases (see mobile/AGENTS.md), so this is a deliberate parallel
// implementation, same convention as every other mobile feature here.
// Direct RLS-gated Supabase calls, no API route, same reasoning as web's
// version: none of this needs a server-side secret.

export interface Channel {
  id: string;
  company_id: string;
  type: 'channel' | 'dm';
  name: string | null;
  slug: string | null;
  topic: string | null;
  is_private: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ChannelListItem extends Channel {
  is_member: boolean;
  last_read_at: string | null;
  last_message_at: string | null;
  unread: boolean;
  dm_other_user_id: string | null;
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

export interface MessageReaction {
  id: string;
  message_id: string;
  channel_id: string;
  emoji: string;
  user_id: string;
}

export interface MessageWithMeta extends Message {
  reactions: MessageReaction[];
  reply_count: number;
}

export interface CompanyMember {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const MENTION_TOKEN_RE = /@\[[^\]]+\]\(([0-9a-f-]{36})\)/gi;

export function parseMentionedUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN_RE)) ids.add(match[1]);
  return Array.from(ids);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

export async function fetchCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const { data: memberships } = await supabase.from('company_memberships').select('user_id').eq('company_id', companyId);
  const userIds = (memberships ?? []).map((m) => m.user_id);
  if (!userIds.length) return [];
  const { data } = await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', userIds);
  return (data ?? []) as CompanyMember[];
}

const RECENT_MESSAGES_SEED_LIMIT = 500;

export async function fetchChannelList(companyId: string, userId: string): Promise<ChannelListItem[]> {
  const [{ data: channels }, { data: memberships }, { data: recentMessages }] = await Promise.all([
    supabase.from('channels').select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at'),
    supabase.from('channel_members').select('channel_id, last_read_at').eq('user_id', userId),
    supabase
      .from('messages')
      .select('channel_id, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_MESSAGES_SEED_LIMIT),
  ]);

  const membershipByChannel = new Map((memberships ?? []).map((m) => [m.channel_id, m.last_read_at as string]));
  const lastMessageByChannel = new Map<string, string>();
  for (const m of recentMessages ?? []) {
    if (!lastMessageByChannel.has(m.channel_id)) lastMessageByChannel.set(m.channel_id, m.created_at as string);
  }

  const dmChannelIds = (channels ?? []).filter((c) => c.type === 'dm').map((c) => c.id);
  const dmOtherUserByChannel = new Map<string, string>();
  if (dmChannelIds.length) {
    const { data: dmMembers } = await supabase.from('channel_members').select('channel_id, user_id').in('channel_id', dmChannelIds);
    for (const row of dmMembers ?? []) {
      if (row.user_id !== userId) dmOtherUserByChannel.set(row.channel_id, row.user_id);
    }
  }

  return (channels ?? []).map((c) => {
    const lastReadAt = membershipByChannel.get(c.id) ?? null;
    const lastMessageAt = lastMessageByChannel.get(c.id) ?? null;
    return {
      ...(c as Channel),
      is_member: membershipByChannel.has(c.id),
      last_read_at: lastReadAt,
      last_message_at: lastMessageAt,
      unread: !!lastMessageAt && (!lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)),
      dm_other_user_id: dmOtherUserByChannel.get(c.id) ?? null,
    };
  });
}

export async function fetchChannelMessages(channelId: string): Promise<MessageWithMeta[]> {
  const [{ data: msgs }, { data: reactions }, { data: replies }] = await Promise.all([
    supabase.from('messages').select('*').eq('channel_id', channelId).is('parent_message_id', null).order('created_at', { ascending: true }),
    supabase.from('message_reactions').select('id, message_id, channel_id, emoji, user_id').eq('channel_id', channelId),
    supabase.from('messages').select('parent_message_id').eq('channel_id', channelId).not('parent_message_id', 'is', null),
  ]);

  const replyCounts = new Map<string, number>();
  for (const r of replies ?? []) {
    const key = r.parent_message_id as string;
    replyCounts.set(key, (replyCounts.get(key) ?? 0) + 1);
  }
  const reactionsByMessage = new Map<string, MessageReaction[]>();
  for (const r of (reactions ?? []) as MessageReaction[]) {
    const list = reactionsByMessage.get(r.message_id) ?? [];
    list.push(r);
    reactionsByMessage.set(r.message_id, list);
  }

  return ((msgs ?? []) as Message[]).map((m) => ({
    ...m,
    reactions: reactionsByMessage.get(m.id) ?? [],
    reply_count: replyCounts.get(m.id) ?? 0,
  }));
}

export async function fetchThreadReplies(parentMessageId: string): Promise<MessageWithMeta[]> {
  const { data: msgs } = await supabase.from('messages').select('*').eq('parent_message_id', parentMessageId).order('created_at', { ascending: true });
  const messageIds = (msgs ?? []).map((m) => m.id);
  const { data: reactions } = messageIds.length
    ? await supabase.from('message_reactions').select('id, message_id, channel_id, emoji, user_id').in('message_id', messageIds)
    : { data: [] as MessageReaction[] };
  const reactionsByMessage = new Map<string, MessageReaction[]>();
  for (const r of (reactions ?? []) as MessageReaction[]) {
    const list = reactionsByMessage.get(r.message_id) ?? [];
    list.push(r);
    reactionsByMessage.set(r.message_id, list);
  }
  return ((msgs ?? []) as Message[]).map((m) => ({ ...m, reactions: reactionsByMessage.get(m.id) ?? [], reply_count: 0 }));
}

export async function createChannel(companyId: string, userId: string, name: string, topic?: string): Promise<{ channel: Channel | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { channel: null, error: 'Name is required' };

  const baseSlug = slugify(trimmed);
  let slug = baseSlug;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await supabase.from('channels').select('id').eq('company_id', companyId).eq('slug', slug).is('deleted_at', null).maybeSingle();
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data, error } = await supabase
    .from('channels')
    .insert({ company_id: companyId, type: 'channel', name: trimmed, slug, topic: topic || null, created_by: userId })
    .select()
    .single();
  return { channel: data as Channel | null, error: error?.message ?? null };
}

export async function findOrCreateDm(companyId: string, userId: string, otherUserId: string): Promise<{ channel: Channel | null; error: string | null }> {
  if (userId === otherUserId) return { channel: null, error: "Can't DM yourself" };

  const { data: myDmChannels } = await supabase
    .from('channel_members')
    .select('channel_id, channels!inner(id, company_id, type)')
    .eq('user_id', userId)
    .eq('channels.company_id', companyId)
    .eq('channels.type', 'dm');

  for (const row of myDmChannels ?? []) {
    const { data: members } = await supabase.from('channel_members').select('user_id').eq('channel_id', row.channel_id);
    const memberIds = new Set((members ?? []).map((m) => m.user_id));
    if (memberIds.size === 2 && memberIds.has(otherUserId)) {
      const { data: channel } = await supabase.from('channels').select('*').eq('id', row.channel_id).single();
      if (channel) return { channel: channel as Channel, error: null };
    }
  }

  const { data: created, error } = await supabase.from('channels').insert({ company_id: companyId, type: 'dm', created_by: userId }).select().single();
  if (error || !created) return { channel: null, error: error?.message ?? 'Failed to start DM' };

  const { error: memberErr } = await supabase.from('channel_members').insert({ channel_id: created.id, user_id: otherUserId });
  if (memberErr) return { channel: null, error: memberErr.message };
  return { channel: created as Channel, error: null };
}

export async function sendMessage(channelId: string, companyId: string, userId: string, body: string, parentMessageId?: string | null): Promise<{ error: string | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty" };
  const mentionedUserIds = parseMentionedUserIds(trimmed);
  const { error } = await supabase.from('messages').insert({
    channel_id: channelId,
    company_id: companyId,
    user_id: userId,
    body: trimmed,
    parent_message_id: parentMessageId ?? null,
    mentioned_user_ids: mentionedUserIds.length ? mentionedUserIds : null,
  });
  return { error: error?.message ?? null };
}

export async function editMessage(messageId: string, body: string): Promise<{ error: string | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty" };
  const mentionedUserIds = parseMentionedUserIds(trimmed);
  const { error } = await supabase
    .from('messages')
    .update({ body: trimmed, edited_at: new Date().toISOString(), mentioned_user_ids: mentionedUserIds.length ? mentionedUserIds : null })
    .eq('id', messageId);
  return { error: error?.message ?? null };
}

export async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
  return { error: error?.message ?? null };
}

export async function toggleReaction(messageId: string, userId: string, emoji: string): Promise<{ error: string | null }> {
  const { data: existing } = await supabase.from('message_reactions').select('id').eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
  return { error: error?.message ?? null };
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  await supabase.from('channel_members').update({ last_read_at: new Date().toISOString() }).eq('channel_id', channelId).eq('user_id', userId);
}

export async function joinChannel(channelId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('channel_members').insert({ channel_id: channelId, user_id: userId });
  return { error: error?.message ?? null };
}
