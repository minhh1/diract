import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Hash, Search, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createChannel, findOrCreateDm, type CompanyMember } from '@/lib/messaging';

// Native port of components/messaging/NewChannelModal.tsx -- same
// channel/DM mode toggle and create-or-find-DM behavior.
interface Props {
  visible: boolean;
  companyId: string;
  userId: string;
  members: CompanyMember[];
  onClose: () => void;
  onCreated: (channelId: string) => void;
}

export function NewChannelModal({ visible, companyId, userId, members, onClose, onCreated }: Props) {
  const theme = useTheme();
  const [mode, setMode] = useState<'channel' | 'dm'>('channel');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherMembers = members.filter((m) => m.id !== userId);
  const filteredMembers = otherMembers.filter((m) => (m.full_name || m.email || '').toLowerCase().includes(search.toLowerCase()));

  const handleCreateChannel = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    const { channel, error: err } = await createChannel(companyId, userId, name, topic || undefined);
    setSaving(false);
    if (err || !channel) { setError(err || 'Failed to create channel'); return; }
    onCreated(channel.id);
  };

  const handleStartDm = async (otherUserId: string) => {
    setSaving(true);
    setError(null);
    const { channel, error: err } = await findOrCreateDm(companyId, userId, otherUserId);
    setSaving(false);
    if (err || !channel) { setError(err || 'Failed to start conversation'); return; }
    onCreated(channel.id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.backgroundElement }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>New</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={18} color={theme.textSecondary} /></Pressable>
          </View>

          <View style={[styles.tabs, { backgroundColor: theme.background }]}>
            <Pressable onPress={() => setMode('channel')} style={[styles.tab, mode === 'channel' && { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.tabText, { color: mode === 'channel' ? theme.text : theme.textSecondary }]}>Channel</Text>
            </Pressable>
            <Pressable onPress={() => setMode('dm')} style={[styles.tab, mode === 'dm' && { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.tabText, { color: mode === 'dm' ? theme.text : theme.textSecondary }]}>Direct message</Text>
            </Pressable>
          </View>

          {error && <Text style={{ color: theme.danger, fontSize: 12, marginBottom: 10 }}>{error}</Text>}

          {mode === 'channel' ? (
            <View style={{ gap: 10 }}>
              <View style={[styles.inputRow, { borderColor: theme.border }]}>
                <Hash size={13} color={theme.textSecondary} />
                <TextInput value={name} onChangeText={setName} placeholder="channel-name" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} autoFocus />
              </View>
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="Topic (optional)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.inputRow, styles.input, { color: theme.text, borderColor: theme.border, borderWidth: 1 }]}
              />
              <Pressable
                onPress={handleCreateChannel}
                disabled={saving || !name.trim()}
                style={[styles.submit, { backgroundColor: theme.accent, opacity: saving || !name.trim() ? 0.4 : 1 }]}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Create channel</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={[styles.inputRow, { borderColor: theme.border }]}>
                <Search size={13} color={theme.textSecondary} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search people..." placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} autoFocus />
              </View>
              <FlatList
                data={filteredMembers}
                keyExtractor={(m) => m.id}
                style={{ maxHeight: 260 }}
                ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', paddingVertical: 24, fontSize: 12 }}>No one found</Text>}
                renderItem={({ item }) => (
                  <Pressable disabled={saving} onPress={() => handleStartDm(item.id)} style={styles.memberRow}>
                    <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
                      <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 11 }}>{(item.full_name || item.email || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '500' }}>{item.full_name || item.email}</Text>
                  </Pressable>
                )}
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: Radii.card, padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 4, borderRadius: 999, padding: 4, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  tabText: { fontSize: 11, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  input: { flex: 1, fontSize: 13 },
  submit: { paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
