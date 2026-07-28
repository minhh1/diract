import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { SYSTEM_TABLE_LABELS, type SystemTableName } from '@/lib/records';
import { systemTablePrimaryDisplayColumn } from '@/lib/systemTableRelations';

export function CreateRecordSheet({
  visible,
  tableName,
  onClose,
  onCreated,
}: {
  visible: boolean;
  tableName: SystemTableName;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const theme = useTheme();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleColumn = systemTablePrimaryDisplayColumn(tableName);

  const handleCreate = async () => {
    if (!title.trim() || !profile?.active_company_id) return;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from(tableName)
      .insert({ [titleColumn]: title.trim(), company_id: profile.active_company_id })
      .select('id')
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not create record.');
      return;
    }
    setTitle('');
    queryClient.invalidateQueries({ queryKey: ['records', tableName] });
    onCreated(data.id);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.title, { color: theme.text }]}>New {SYSTEM_TABLE_LABELS[tableName].replace(/s$/, '')}</Text>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            placeholder={titleColumn === 'street_address' ? 'Street address' : 'Name'}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
          />
          {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>{error}</Text>}
          <View style={styles.actionsRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.createButton, { backgroundColor: theme.accent, opacity: title.trim() ? 1 : 0.5 }]}
              disabled={!title.trim() || saving}
              onPress={handleCreate}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: 20, paddingBottom: 36, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12 },
  title: { fontSize: 17, fontWeight: '800' },
  input: { padding: 14, borderRadius: 16, borderWidth: 1, fontSize: 15, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 16 },
  createButton: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 20 },
  createButtonText: { color: '#fff', fontWeight: '800' },
});
