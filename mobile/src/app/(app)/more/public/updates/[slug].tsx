import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ArrowDownAZ, ArrowUpAZ, LayoutGrid, Search, Send, Sparkles, Table2, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dateFormat';
import { formatCurrency } from '@/lib/format';
import {
  askAboutClientUpdateItem,
  useAddClientUpdateNote,
  useClientUpdateBoard,
  type ClientUpdateBoard,
  type ClientUpdateField,
  type ClientUpdateItem,
  type ClientUpdateNote,
} from '@/lib/clientUpdatePages';

// Native port of components/public/PublicClientUpdateContent.tsx's staff
// path -- full unfiltered board (every group/field, not just
// client_visible=true ones), same as the "preview as client" embed on web
// (components/dashboard/ClientUpdatePageWidget.tsx just renders that same
// component with a staff session). Groups can nest one level
// (parent_group_id) -- shown here as "Parent / Child" section headers
// rather than a full collapsible tree, matching the depth actually seen in
// production data.
function groupLabel(groupId: string | null, board: ClientUpdateBoard): string {
  if (!groupId) return 'Ungrouped';
  const group = board.groups.find((g) => g.id === groupId);
  if (!group) return 'Ungrouped';
  const parent = group.parent_group_id ? board.groups.find((g) => g.id === group.parent_group_id) : null;
  return parent ? `${parent.name} / ${group.name}` : group.name;
}

function fieldsForItem(item: ClientUpdateItem, board: ClientUpdateBoard) {
  return board.fields
    .filter((f) => f.group_id === null || f.group_id === item.group_id)
    .filter((f, i, arr) => arr.findIndex((f2) => f2.label === f.label) === i) // de-dup same label across group-scoped variants
    .sort((a, b) => a.display_order - b.display_order);
}

// Every distinct field (by label) across the whole board, regardless of
// which group it's scoped to -- spreadsheet mode's column set, since a
// flat table crossing every group needs one consistent set of columns
// rather than each row bringing its own.
function allBoardFields(board: ClientUpdateBoard) {
  return board.fields
    // "Matter" (field_key 'name') is already the spreadsheet's own fixed
    // first column (item.display_name/matterName) -- including it again
    // here would show the same value in two columns.
    .filter((f) => f.field_key !== 'name')
    .filter((f, i, arr) => arr.findIndex((f2) => f2.label === f.label) === i)
    .sort((a, b) => a.display_order - b.display_order);
}

// Field ids (across every group-scoped variant) whose label reads as a
// status column -- there's no dedicated "is the status field" flag in the
// schema, so this is the same heuristic a person would use looking at the
// column headers.
function statusFieldIds(board: ClientUpdateBoard): string[] {
  return board.fields.filter((f) => f.label.trim().toLowerCase() === 'status').map((f) => f.id);
}

function itemStatusValue(item: ClientUpdateItem, statusIds: string[]): string | null {
  for (const id of statusIds) {
    const v = item.values[id];
    if (v != null && v !== '') return String(v);
  }
  return null;
}

// Applies the admin's saved per-group default (see clientUpdatePages.ts's
// ClientUpdateViewDefault doc comment) if one exists for this group,
// falling back to a plain alphabetical-by-matter sort -- better than the
// API's raw insertion order with zero configuration needed, same as
// MatterBoard.tsx's own "no default" fallback on web.
function sortItems(items: ClientUpdateItem[], board: ClientUpdateBoard, groupId: string | null): ClientUpdateItem[] {
  const defaults = groupId ? board.viewDefaults.find((v) => v.group_id === groupId) : undefined;
  const sortRule = defaults?.sort[0];
  return [...items].sort((a, b) => {
    if (sortRule) {
      const av = String(a.values[sortRule.fieldId] ?? '');
      const bv = String(b.values[sortRule.fieldId] ?? '');
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortRule.dir === 'desc' ? -cmp : cmp;
    }
    return (a.display_name || a.matterName).localeCompare(b.display_name || b.matterName, undefined, { numeric: true });
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors components/clientUpdatePages/MatterBoard.tsx's formatValue --
// only a genuinely date-typed field with a plain YYYY-MM-DD value gets
// reformatted; everything else renders as-is.
function formatFieldValue(value: unknown, field: ClientUpdateField, dateFormat: string): string {
  if (field.field_type === 'currency') return formatCurrency(value);
  const str = String(value);
  return field.field_type === 'date' && DATE_ONLY.test(str) ? formatDate(str, dateFormat) : str;
}

// Mirrors MatterBoard.tsx's formatNoteTimestamp -- note_date (possibly
// backdated by staff) supplies the day, created_at supplies the time.
function formatNoteTimestamp(note: ClientUpdateNote, dateFormat: string): string {
  const datePart = note.note_date ? formatDate(note.note_date, dateFormat) : null;
  if (!datePart) return new Date(note.created_at).toLocaleDateString('en-AU');
  const time = new Date(note.created_at);
  if (isNaN(time.getTime())) return datePart;
  return `${datePart}, ${time.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`;
}

function ItemDetailModal({
  item,
  board,
  slug,
  onClose,
}: {
  item: ClientUpdateItem | null;
  board: ClientUpdateBoard;
  slug: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const addNote = useAddClientUpdateNote(board.page.id, slug);

  if (!item) return null;
  const fields = fieldsForItem(item, board);

  const submitNote = () => {
    const body = note.trim();
    if (!body) return;
    setNote('');
    addNote.mutate({ itemId: item.id, note: body });
  };

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setAnswer(null);
    try {
      const fieldContext = fields.map((f) => ({ label: f.label, value: String(item.values[f.id] ?? '') }));
      const result = await askAboutClientUpdateItem(board.page.id, item.id, q, fieldContext);
      setAnswer(result);
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : 'Could not get an answer.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
              {item.display_name || item.matterName}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {!!item.ai_summary && (
              <View style={[styles.summaryCard, { backgroundColor: theme.backgroundSelected }]}>
                <Sparkles size={14} color={theme.accent} />
                <Text style={{ color: theme.text, fontSize: 13, flex: 1, lineHeight: 19 }}>{item.ai_summary}</Text>
              </View>
            )}

            <View style={[styles.fieldsCard, { backgroundColor: theme.backgroundElement }]}>
              {fields.map((field) => {
                const value = item.values[field.id];
                if (value == null || value === '') return null;
                return (
                  <View key={field.id} style={styles.fieldRow}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{field.label}</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{formatFieldValue(value, field, board.page.date_format)}</Text>
                  </View>
                );
              })}
            </View>

            {board.page.ai_ask_enabled && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>ASK AI ABOUT THIS MATTER</Text>
                <View style={[styles.askRow, { backgroundColor: theme.backgroundElement }]}>
                  <TextInput
                    value={question}
                    onChangeText={setQuestion}
                    onSubmitEditing={ask}
                    placeholder="Ask a question..."
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.askInput, { color: theme.text }]}
                  />
                  <Pressable onPress={ask} disabled={asking || !question.trim()}>
                    {asking ? <ActivityIndicator size="small" /> : <Send size={16} color={theme.accent} />}
                  </Pressable>
                </View>
                {answer && <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{answer}</Text>}
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>NOTES</Text>
              {item.notes.map((n) => (
                <View key={n.id} style={[styles.noteCard, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>{n.body}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4, fontWeight: '600' }}>
                    {n.author_name} · {formatNoteTimestamp(n, board.page.date_format)}
                  </Text>
                </View>
              ))}
              <View style={[styles.askRow, { backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  onSubmitEditing={submitNote}
                  placeholder="Add a note..."
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.askInput, { color: theme.text }]}
                />
                <Pressable onPress={submitNote} disabled={addNote.isPending || !note.trim()}>
                  <Send size={16} color={theme.accent} />
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ClientUpdatePageScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: board, isLoading } = useClientUpdateBoard(slug);
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ClientUpdateItem | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'spreadsheet'>('cards');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());

  const statusIds = useMemo(() => (board ? statusFieldIds(board) : []), [board]);
  const statusOptions = useMemo(() => {
    if (!board) return [];
    const values = new Set<string>();
    for (const item of board.items) {
      const v = itemStatusValue(item, statusIds);
      if (v) values.add(v);
    }
    return Array.from(values).sort();
  }, [board, statusIds]);

  const filteredItems = useMemo(() => {
    if (!board) return [];
    const q = query.trim().toLowerCase();
    return board.items.filter((i) => {
      if (q && !(i.display_name || i.matterName).toLowerCase().includes(q)) return false;
      if (statusFilter.size > 0) {
        const status = itemStatusValue(i, statusIds);
        if (!status || !statusFilter.has(status)) return false;
      }
      return true;
    });
  }, [board, query, statusFilter, statusIds]);

  const grouped = useMemo(() => {
    if (!board) return [];
    const byGroup = new Map<string, { groupId: string | null; items: ClientUpdateItem[] }>();
    for (const item of filteredItems) {
      const label = groupLabel(item.group_id, board);
      if (!byGroup.has(label)) byGroup.set(label, { groupId: item.group_id, items: [] });
      byGroup.get(label)!.items.push(item);
    }
    return Array.from(byGroup.entries()).map(([label, { groupId, items }]) => {
      const sorted = sortItems(items, board, groupId);
      return [label, sortDir === 'desc' ? sorted.reverse() : sorted] as const;
    });
  }, [board, filteredItems, sortDir]);

  const spreadsheetItems = useMemo(() => {
    if (!board) return [];
    return sortDir === 'desc' ? sortItems(filteredItems, board, null).reverse() : sortItems(filteredItems, board, null);
  }, [board, filteredItems, sortDir]);

  if (isLoading || !board) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const spreadsheetColumns = allBoardFields(board);
  const columnWidth = (f: ClientUpdateField) => (f.field_type === 'currency' || f.field_type === 'date' ? 130 : 160);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement }]}>
        <Search size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search matters"
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
        <Pressable onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} hitSlop={6}>
          {sortDir === 'asc' ? <ArrowDownAZ size={18} color={theme.textSecondary} /> : <ArrowUpAZ size={18} color={theme.textSecondary} />}
        </Pressable>
        <Pressable onPress={() => setViewMode((m) => (m === 'cards' ? 'spreadsheet' : 'cards'))} hitSlop={6}>
          {viewMode === 'cards' ? <Table2 size={18} color={theme.textSecondary} /> : <LayoutGrid size={18} color={theme.textSecondary} />}
        </Pressable>
      </View>

      {statusOptions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {statusOptions.map((opt) => {
            const active = statusFilter.has(opt);
            return (
              <Pressable
                key={opt}
                onPress={() =>
                  setStatusFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(opt)) next.delete(opt);
                    else next.add(opt);
                    return next;
                  })
                }
                style={[styles.filterChip, { backgroundColor: active ? theme.accent : theme.backgroundSelected }]}
              >
                <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>{opt}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {viewMode === 'cards' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {grouped.map(([label, items]) => (
            <View key={label} style={{ gap: 6 }}>
              <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>{label.toUpperCase()}</Text>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedItem(item)}
                  style={[styles.itemRow, { backgroundColor: theme.backgroundElement }]}
                >
                  <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={2}>
                    {item.display_name || item.matterName}
                  </Text>
                  {item.notes.length > 0 && (
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>{item.notes.length}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={[styles.spreadsheetBorder, { borderColor: theme.border }]}>
          <View>
            <View style={[styles.spreadsheetRow, styles.spreadsheetHeaderRow, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
              <Text style={[styles.spreadsheetCell, styles.spreadsheetHeaderCell, { width: 180, color: theme.textSecondary }]}>MATTER</Text>
              {spreadsheetColumns.map((f) => (
                <Text key={f.id} numberOfLines={1} style={[styles.spreadsheetCell, styles.spreadsheetHeaderCell, { width: columnWidth(f), color: theme.textSecondary }]}>
                  {f.label}
                </Text>
              ))}
            </View>
            <ScrollView contentContainerStyle={{ flexGrow: 0 }}>
              {spreadsheetItems.map((item) => {
                const fields = fieldsForItem(item, board);
                const fieldByLabel = new Map(fields.map((f) => [f.label, f]));
                return (
                  <Pressable key={item.id} onPress={() => setSelectedItem(item)} style={[styles.spreadsheetRow, { borderColor: theme.border }]}>
                    <Text numberOfLines={1} style={[styles.spreadsheetCell, { width: 180, color: theme.text, fontWeight: '700' }]}>
                      {item.display_name || item.matterName}
                    </Text>
                    {spreadsheetColumns.map((col) => {
                      const field = fieldByLabel.get(col.label);
                      const value = field ? item.values[field.id] : undefined;
                      return (
                        <Text key={col.id} numberOfLines={1} style={[styles.spreadsheetCell, { width: columnWidth(col), color: theme.text }]}>
                          {field && value != null && value !== '' ? formatFieldValue(value, field, board.page.date_format) : '-'}
                        </Text>
                      );
                    })}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      <ItemDetailModal item={selectedItem} board={board} slug={slug} onClose={() => setSelectedItem(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 0, paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.pill },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  filterScroll: { flexGrow: 0, minHeight: 48 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center', minHeight: 30 },
  list: { padding: 16, gap: 14, paddingBottom: 48 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  spreadsheetBorder: { margin: 16, marginTop: 0, borderWidth: 1, borderRadius: Radii.card },
  spreadsheetRow: { flexDirection: 'row', borderBottomWidth: 1 },
  spreadsheetHeaderRow: { borderBottomWidth: 1 },
  spreadsheetCell: { padding: 12, fontSize: 13 },
  spreadsheetHeaderCell: { fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: Radii.badge },
  itemName: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { height: '85%', borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  summaryCard: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: Radii.badge },
  fieldsCard: { borderRadius: Radii.badge, padding: 4 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  fieldValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.pill },
  askInput: { flex: 1, fontSize: 13, fontWeight: '500' },
  noteCard: { padding: 12, borderRadius: Radii.badge },
});
