import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { SYSTEM_TABLE_LABELS, useRecords, type RecordRow, type SystemTableName } from '@/lib/records';

import { CreateRecordSheet } from './CreateRecordSheet';

function subtitleFor(row: RecordRow): string | null {
  const status = row.values.status ?? row.values.entity_type ?? row.values.stage;
  if (typeof status === 'string' && status) return status;
  if (row.createdAt) return `Added ${new Date(row.createdAt).toLocaleDateString('en-AU')}`;
  return null;
}

export function RecordListView({ tableName, basePath }: { tableName: SystemTableName; basePath: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useSession();
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const recordsQuery = useRecords(tableName, profile?.active_company_id ?? null);
  const rows = recordsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => r.title.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <Search size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${SYSTEM_TABLE_LABELS[tableName].toLowerCase()}`}
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>

      {recordsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 96 }}
          refreshing={recordsQuery.isFetching}
          onRefresh={() => recordsQuery.refetch()}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: theme.textSecondary }}>No {SYSTEM_TABLE_LABELS[tableName].toLowerCase()} yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`${basePath}/${item.id}` as never)}
              style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            >
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              {subtitleFor(item) && (
                <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  {subtitleFor(item)}
                </Text>
              )}
            </Pressable>
          )}
        />
      )}

      <Pressable style={[styles.fab, { backgroundColor: theme.accent }]} onPress={() => setShowCreate(true)}>
        <Plus color="#fff" size={22} />
      </Pressable>

      <CreateRecordSheet
        visible={showCreate}
        tableName={tableName}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false);
          router.push(`${basePath}/${id}` as never);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  row: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
