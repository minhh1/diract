import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useRealtimeChannel } from '@/lib/useRealtimeChannel';
import { fetchChannelList, fetchCompanyMembers, type ChannelListItem as ChannelListItemType } from '@/lib/messaging';
import { ChannelListItem } from '@/components/messaging/ChannelListItem';
import { NewChannelModal } from '@/components/messaging/NewChannelModal';

// Native port of app/(app)/dashboard/messaging/page.tsx's sidebar --
// channels + DMs as a full list screen instead of a permanent side rail
// (see more/ai/index.tsx for the same "sidebar becomes a screen on phone"
// pattern). Realtime handling is deliberately simpler than web's warm-cache
// useMessagingChannels hook -- just invalidate-and-refetch on any relevant
// change, matching this app's existing convention (ai/index.tsx does the
// same after mutations) rather than porting web's in-place patch logic.
export default function MessagesListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useSession();
  const companyId = profile?.active_company_id ?? null;
  const userId = profile?.id ?? null;
  const [showNewModal, setShowNewModal] = useState(false);

  const channelsQueryKey = ['messaging-channels', companyId, userId];
  const membersQueryKey = ['messaging-members', companyId];

  const { data: channels, isLoading } = useQuery({
    queryKey: channelsQueryKey,
    queryFn: () => fetchChannelList(companyId!, userId!),
    enabled: !!companyId && !!userId,
  });

  const { data: members } = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => fetchCompanyMembers(companyId!),
    enabled: !!companyId,
  });

  const invalidateChannels = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: channelsQueryKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId]);

  useRealtimeChannel({ tableName: 'messages', filterColumn: 'company_id', filterValue: companyId, onInsert: invalidateChannels, onUpdate: invalidateChannels, onDelete: invalidateChannels });
  useRealtimeChannel({ tableName: 'channels', filterColumn: 'company_id', filterValue: companyId, onInsert: invalidateChannels, onUpdate: invalidateChannels, onDelete: invalidateChannels });

  const openChannel = (channelId: string) => router.push({ pathname: '/messages/[id]', params: { id: channelId } } as never);

  const handleCreated = (channelId: string) => {
    setShowNewModal(false);
    queryClient.invalidateQueries({ queryKey: channelsQueryKey });
    openChannel(channelId);
  };

  const namedChannels = (channels ?? []).filter((c) => c.type === 'channel').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const dms = (channels ?? []).filter((c) => c.type === 'dm');
  const sections: Array<{ title: string; data: ChannelListItemType[] }> = [
    { title: 'Channels', data: namedChannels },
    { title: 'Direct messages', data: dms },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Pressable onPress={() => setShowNewModal(true)} style={[styles.newRow, { backgroundColor: theme.backgroundSelected }]}>
        <Plus size={18} color={theme.accent} />
        <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 14 }}>New channel or DM</Text>
      </Pressable>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          contentContainerStyle={styles.list}
          renderItem={({ item: section }) => (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{section.title}</Text>
              {section.data.length === 0 ? (
                <Text style={{ color: theme.textSecondary, fontSize: 12, paddingHorizontal: 14, paddingVertical: 6 }}>
                  {section.title === 'Channels' ? 'No channels yet' : 'No conversations yet'}
                </Text>
              ) : (
                section.data.map((c) => (
                  <ChannelListItem key={c.id} channel={c} members={members ?? []} onPress={() => openChannel(c.id)} />
                ))
              )}
            </View>
          )}
        />
      )}

      {companyId && userId && (
        <NewChannelModal
          visible={showNewModal}
          companyId={companyId}
          userId={userId}
          members={members ?? []}
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  newRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, marginBottom: 8, padding: 14, borderRadius: 999 },
  list: { padding: 12, paddingTop: 8 },
  sectionTitle: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
});
