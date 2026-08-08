import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Hash, Lock } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import type { ChannelListItem as ChannelListItemType, CompanyMember } from '@/lib/messaging';

// Native row for a channel or DM in the messages list screen -- same
// unread-dot treatment as web's ChannelSidebar.tsx, one row component per
// entry instead of that file's inline .map since this list also needs to
// render standalone inside a FlatList.
export function dmLabel(channel: ChannelListItemType, members: CompanyMember[]): string {
  const other = members.find((m) => m.id === channel.dm_other_user_id);
  return other?.full_name || other?.email || 'Direct message';
}

interface Props {
  channel: ChannelListItemType;
  members: CompanyMember[];
  onPress: () => void;
}

export function ChannelListItem({ channel, members, onPress }: Props) {
  const theme = useTheme();
  const isDm = channel.type === 'dm';
  const label = isDm ? dmLabel(channel, members) : channel.name || '';

  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      {isDm ? (
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
          <Text style={[styles.avatarText, { color: theme.accent }]}>{label.charAt(0).toUpperCase()}</Text>
        </View>
      ) : channel.is_private ? (
        <Lock size={14} color={theme.textSecondary} />
      ) : (
        <Hash size={14} color={theme.textSecondary} />
      )}
      <Text numberOfLines={1} style={[styles.label, { color: theme.text }, channel.unread && styles.labelUnread]}>
        {label}
      </Text>
      {channel.unread && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '800' },
  label: { flex: 1, fontSize: 14, fontWeight: '500' },
  labelUnread: { fontWeight: '800' },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
