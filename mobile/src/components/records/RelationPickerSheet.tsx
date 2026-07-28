import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Option = { id: string; label: string };

export function RelationPickerSheet({
  visible,
  table,
  displayColumn,
  onClose,
  onSelect,
}: {
  visible: boolean;
  table: string;
  displayColumn: string;
  onClose: () => void;
  onSelect: (option: Option) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['relation-search', table, displayColumn, query],
    enabled: visible,
    queryFn: async (): Promise<Option[]> => {
      // A dynamic column name in a template-literal select string defeats
      // supabase-js's compile-time query parser (it tries to statically
      // parse the literal and fails on an interpolated value) -- selecting
      // '*' and picking the column off the resulting row sidesteps that
      // entirely, at the cost of a few unused columns over the wire.
      let request = supabase.from(table).select('*').limit(25);
      if (query.trim()) request = request.ilike(displayColumn, `%${query.trim()}%`);
      const { data: rows } = await request;
      return ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
        id: row.id as string,
        label: String(row[displayColumn] ?? '(untitled)'),
      }));
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <Search size={16} color={theme.textSecondary} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={data ?? []}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={{ color: theme.textSecondary, padding: 16 }}>No matches.</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.optionRow} onPress={() => onSelect(item)}>
                  <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>{item.label}</Text>
                </Pressable>
              )}
            />
          )}

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: 16, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  optionRow: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.2)' },
  cancelButton: { alignItems: 'center', paddingVertical: 10 },
});
