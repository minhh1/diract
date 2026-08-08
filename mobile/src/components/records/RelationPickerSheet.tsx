import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { fetchMatterNumbersByProjectId, withMatterNumber } from '@/lib/matterNumberDisplay';

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
      // profiles (real users) has no deleted_at column -- is_active is its
      // equivalent "still a live option" flag, matching the web picker's
      // same special case (components/dashboard/RelationPicker.tsx).
      if (table === 'profiles') request = request.eq('is_active', true);
      if (query.trim()) request = request.ilike(displayColumn, `%${query.trim()}%`);
      const { data: rows } = await request;
      const byId = new Map<string, Record<string, unknown>>((rows ?? []).map((row: any) => [row.id as string, row]));

      // A Matter search also needs to match on its matter number, not just
      // its name -- e.g. typing "1234" should find matter "1234, Smith v
      // Jones" even though "1234" never appears in its name column. Fetches
      // the number-matched rows as a second query rather than reworking
      // this into "fetch everything, filter client-side" (RelationPicker.tsx's
      // own web-side fix for the same problem) -- fine at this table's scale
      // via .limit(25) on each side. Wrapped in try/catch so a failure here
      // (or in the label-enrichment below) still leaves the plain
      // name-matched results usable rather than failing the whole search.
      if (table === 'projects' && query.trim()) {
        try {
          const { data: numberField } = await supabase
            .from('company_custom_fields')
            .select('id')
            .eq('table_name', 'projects')
            .eq('field_key', 'matter_number')
            .is('deleted_at', null)
            .maybeSingle();
          if (numberField) {
            const { data: numberMatches } = await supabase
              .from('company_custom_field_values')
              .select('record_id')
              .eq('field_id', numberField.id)
              .ilike('value_text', `%${query.trim()}%`)
              .limit(25);
            const missingIds = (numberMatches ?? []).map((v: any) => v.record_id as string).filter((id) => !byId.has(id));
            if (missingIds.length) {
              const { data: extraRows } = await supabase.from(table).select('*').in('id', missingIds);
              (extraRows ?? []).forEach((row: any) => byId.set(row.id as string, row));
            }
          }
        } catch (err) {
          console.error('[RelationPickerSheet] matter number search failed:', err);
        }
      }

      const allRows = Array.from(byId.values());
      let numberById = new Map<string, string>();
      if (table === 'projects') {
        try {
          numberById = await fetchMatterNumbersByProjectId(allRows.map((row) => row.id as string));
        } catch (err) {
          console.error('[RelationPickerSheet] fetchMatterNumbersByProjectId failed:', err);
        }
      }
      return allRows.map((row) => ({
        id: row.id as string,
        label: withMatterNumber(String(row[displayColumn] ?? '(untitled)'), numberById.get(row.id as string)),
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
