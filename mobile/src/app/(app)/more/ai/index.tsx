import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Pin, Plus, Trash2 } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { deleteConversation, fetchConversations, patchConversation, type ConversationSummary } from '@/lib/aiChat';

// Conversation list for the native table/dashboard-builder assistant --
// mirrors app/(app)/dashboard/ai/page.tsx's sidebar (pin/rename/delete, same
// app/api/ai/conversations endpoints) as a full screen instead, since a
// permanent side rail doesn't fit a phone. See AiChatThread.tsx for the
// actual per-conversation turn logic.
export default function AiConversationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useSession();
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: fetchConversations,
    enabled: !!profile?.is_admin,
  });

  const openConversation = (id: string) => router.push({ pathname: '/more/ai/[id]', params: { id } } as never);

  const startNewChat = () => openConversation(Crypto.randomUUID());

  const togglePin = async (c: ConversationSummary) => {
    await patchConversation(c.id, { pinned: !c.pinned });
    queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
  };

  const confirmDelete = async (c: ConversationSummary) => {
    await deleteConversation(c.id);
    queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
  };

  const saveRename = async () => {
    if (!renaming) return;
    await patchConversation(renaming.id, { title: renameValue.trim() });
    setRenaming(null);
    queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
  };

  if (!profile?.is_admin) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
          Admin access required. Ask a company admin for access to the table/dashboard-builder assistant.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Pressable onPress={startNewChat} style={[styles.newChatRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <Plus size={18} color={theme.accent} />
        <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 14 }}>New chat</Text>
      </Pressable>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No conversations yet.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => openConversation(item.id)} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
                  {item.title}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => togglePin(item)}
                accessibilityLabel={item.pinned ? 'Unpin conversation' : 'Pin conversation'}
                style={[styles.iconButton, item.pinned && { backgroundColor: theme.backgroundSelected }]}
              >
                <Pin size={15} color={item.pinned ? theme.accent : theme.textSecondary} fill={item.pinned ? theme.accent : 'transparent'} />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setRenaming(item);
                  setRenameValue(item.title);
                }}
                accessibilityLabel="Rename conversation"
                style={styles.iconButton}
              >
                <Pencil size={15} color={theme.textSecondary} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => confirmDelete(item)} accessibilityLabel="Delete conversation" style={styles.iconButton}>
                <Trash2 size={15} color={theme.danger} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Rename conversation</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              style={[styles.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRenaming(null)} style={styles.modalButton}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveRename} style={styles.modalButton}>
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newChatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, marginBottom: 8, padding: 14, borderRadius: 16, borderWidth: 1 },
  list: { padding: 16, paddingTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 14, borderRadius: 14, borderWidth: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  iconButton: { padding: 6, borderRadius: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  modalTitle: { fontSize: 15, fontWeight: '800' },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  modalButton: { padding: 4 },
});
