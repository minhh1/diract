import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useState } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useRealtimeChannel } from '@/lib/useRealtimeChannel';
import {
  fetchChannelList,
  fetchChannelMessages,
  fetchCompanyMembers,
  fetchThreadReplies,
  joinChannel,
  markChannelRead,
} from '@/lib/messaging';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { MessageComposer } from '@/components/messaging/MessageComposer';

// Native port of app/(app)/dashboard/messaging/page.tsx + ThreadPanel.tsx.
// A side-by-side thread panel doesn't fit a phone screen, so an open
// thread is a bottom-sheet Modal here instead -- same content (pinned
// parent + replies + a thread-scoped composer), just presented as an
// overlay rather than a permanent right column. Realtime is
// invalidate-and-refetch (see messages/index.tsx's own note), not web's
// in-place patch.
export default function ChannelScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { profile } = useSession();
  const companyId = profile?.active_company_id ?? null;
  const userId = profile?.id ?? null;
  const isAdmin = !!profile?.is_admin;

  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const channelsQueryKey = ['messaging-channels', companyId, userId];
  const membersQueryKey = ['messaging-members', companyId];
  const messagesQueryKey = ['messaging-messages', channelId];
  const threadQueryKey = ['messaging-thread', openThreadId];

  const { data: channels } = useQuery({
    queryKey: channelsQueryKey,
    queryFn: () => fetchChannelList(companyId!, userId!),
    enabled: !!companyId && !!userId,
  });

  const { data: members } = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => fetchCompanyMembers(companyId!),
    enabled: !!companyId,
  });

  const { data: messages, isLoading } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: () => fetchChannelMessages(channelId!),
    enabled: !!channelId,
  });

  const { data: replies } = useQuery({
    queryKey: threadQueryKey,
    queryFn: () => fetchThreadReplies(openThreadId!),
    enabled: !!openThreadId,
  });

  const invalidateMessages = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    if (openThreadId) queryClient.invalidateQueries({ queryKey: ['messaging-thread', openThreadId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, openThreadId]);

  useRealtimeChannel({ tableName: 'messages', filterColumn: 'channel_id', filterValue: channelId, onInsert: invalidateMessages, onUpdate: invalidateMessages, onDelete: invalidateMessages });
  useRealtimeChannel({ tableName: 'message_reactions', filterColumn: 'channel_id', filterValue: channelId, onInsert: invalidateMessages, onUpdate: invalidateMessages, onDelete: invalidateMessages });

  const channel = channels?.find((c) => c.id === channelId) ?? null;
  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  const joinedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!channel || !userId || channel.is_member || joinedRef.current === channel.id) return;
    joinedRef.current = channel.id;
    joinChannel(channel.id, userId).then(() => queryClient.invalidateQueries({ queryKey: channelsQueryKey }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, userId]);

  useEffect(() => {
    if (!channelId || !userId) return;
    markChannelRead(channelId, userId).then(() => queryClient.invalidateQueries({ queryKey: channelsQueryKey }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, userId]);

  const title = channel ? (channel.type === 'channel' ? channel.name || 'Channel' : membersById.get(channel.dm_other_user_id ?? '')?.full_name || 'Direct message') : 'Chat';
  const openThreadMessage = (messages ?? []).find((m) => m.id === openThreadId) ?? null;

  if (isLoading || !channelId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title }} />

      <FlatList
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No messages yet</Text>}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            sender={membersById.get(item.user_id)}
            currentUserId={userId!}
            isAdmin={isAdmin}
            onOpenThread={setOpenThreadId}
          />
        )}
      />

      {companyId && userId && (
        <View style={[styles.composerArea, { borderColor: theme.border }]}>
          <MessageComposer channelId={channelId} companyId={companyId} userId={userId} members={members ?? []} channels={channels ?? []} />
        </View>
      )}

      <Modal visible={!!openThreadId} animationType="slide" onRequestClose={() => setOpenThreadId(null)}>
        <View style={[styles.threadContainer, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
          <View style={[styles.threadHeader, { borderColor: theme.border }]}>
            <Text style={[styles.threadTitle, { color: theme.text }]}>Thread</Text>
            <Pressable onPress={() => setOpenThreadId(null)} hitSlop={8}><X size={18} color={theme.textSecondary} /></Pressable>
          </View>
          <FlatList
            data={openThreadMessage ? [openThreadMessage, ...(replies ?? [])] : []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                sender={membersById.get(item.user_id)}
                currentUserId={userId!}
                isAdmin={isAdmin}
                showThreadAction={false}
              />
            )}
          />
          {companyId && userId && openThreadId && (
            <View style={[styles.composerArea, { borderColor: theme.border }]}>
              <MessageComposer
                channelId={channelId}
                companyId={companyId}
                userId={userId}
                parentMessageId={openThreadId}
                members={members ?? []}
                channels={channels ?? []}
                placeholder="Reply in thread..."
              />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 10, paddingBottom: 20 },
  composerArea: { borderTopWidth: 1, padding: 10 },
  threadContainer: { flex: 1 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  threadTitle: { fontSize: 13, fontWeight: '800' },
});
