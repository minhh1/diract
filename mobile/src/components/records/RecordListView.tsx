import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Search } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useGradients, useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { SYSTEM_TABLE_LABELS, useRecords, type RecordRow, type SystemTableName } from '@/lib/records';

import { CreateRecordSheet } from './CreateRecordSheet';

// The status/stage-like value, if any -- rendered as a pill badge, distinct
// from the plain "Added <date>" fallback text (which isn't a status, and
// looks wrong as a pill).
function statusFor(row: RecordRow): string | null {
  const status = row.values.status ?? row.values.entity_type ?? row.values.stage;
  return typeof status === 'string' && status ? status : null;
}

function subtitleFor(row: RecordRow): string | null {
  return statusFor(row) ?? (row.createdAt ? `Added ${new Date(row.createdAt).toLocaleDateString('en-AU')}` : null);
}

export function RecordListView({ tableName, basePath }: { tableName: SystemTableName; basePath: string }) {
  const theme = useTheme();
  const gradients = useGradients();
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
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement }]}>
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
          renderItem={({ item }) => {
            const status = statusFor(item);
            return (
              <Pressable
                onPress={() => router.push(`${basePath}/${item.id}` as never)}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}
              >
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {status ? (
                  <View style={[styles.statusPill, { backgroundColor: theme.backgroundSelected }]}>
                    <Text style={[styles.statusPillText, { color: theme.accent }]}>{status}</Text>
                  </View>
                ) : (
                  subtitleFor(item) && (
                    <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                      {subtitleFor(item)}
                    </Text>
                  )
                )}
              </Pressable>
            );
          }}
        />
      )}

      <Pressable onPress={() => setShowCreate(true)} style={styles.fab}>
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
          <Plus color="#fff" size={22} />
        </LinearGradient>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radii.pill,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  row: { padding: 16, borderRadius: Radii.badge, gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '600' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabGradient: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
