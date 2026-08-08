import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

// "Pham, Huy" -> "PH", same as web's initials() -- first letter of the
// first two words regardless of "Last, First" vs "First Last" ordering.
function initials(name: string): string {
  const parts = name.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type RangePreset = 'this_month' | 'this_week' | 'all_time';
const PRESET_LABELS: Record<RangePreset, string> = { this_month: 'This month', this_week: 'This week', all_time: 'All time' };

type GroupBy = 'timekeeper' | 'time' | 'entries';
const GROUP_LABELS: Record<GroupBy, string> = { timekeeper: 'By timekeeper', time: 'By time', entries: 'By entries' };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const res = new Date(d);
  res.setDate(d.getDate() + diff);
  return res;
}

function PillGroup<T extends string>({ options, labels, value, onChange }: { options: T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.pillGroup, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((opt) => (
        <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.pillOption, value === opt && { backgroundColor: theme.backgroundElement }]}>
          <Text style={{ color: value === opt ? theme.accent : theme.textSecondary, fontSize: 10, fontWeight: '800' }}>{labels[opt]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EntryRow({ entry, showStaff }: { entry: CustomTableRecord; showStaff: boolean }) {
  const theme = useTheme();
  const staffName = showStaff ? entry.displayValues?.staff : undefined;
  return (
    <View style={[styles.entryRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.entryTopRow}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '600', flex: 1 }}>
          {String(entry.values.description || '') || 'No description'}
        </Text>
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(Number(entry.values.amount) || 0)}</Text>
      </View>
      <View style={styles.entryBottomRow}>
        {showStaff && !!staffName && (
          <View style={[styles.initialsBadge, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 8, fontWeight: '800' }}>{initials(staffName)}</Text>
          </View>
        )}
        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{new Date(String(entry.values.date || '').slice(0, 10)).toLocaleDateString('en-AU')}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{Number(entry.values.duration_hours) || 0}h</Text>
        <View style={[styles.billableBadge, { backgroundColor: entry.values.billable ? theme.successBackground : theme.backgroundSelected }]}>
          <Text style={{ color: entry.values.billable ? theme.success : theme.textSecondary, fontSize: 8, fontWeight: '800' }}>
            {entry.values.billable ? 'BILLABLE' : 'NON-BILLABLE'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Native port of components/dashboard/TimeFeesReportWidget.tsx -- purely
// client-side aggregation over `records` (already RLS-scoped exactly like
// web's version, and already relation-resolved via
// dashboardWidgets/relationResolution.ts, so entry.displayValues.staff is
// used directly instead of web's separate useRecordNames call). v1 gap:
// no inline "adjust entry" edit -- read-only, same as this app's other
// report-style widgets; a real edit needs the record detail view, not a
// quick inline field.
export function TimeFeesReportWidget({ records }: { records: CustomTableRecord[] }) {
  const theme = useTheme();
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [groupBy, setGroupBy] = useState<GroupBy>('timekeeper');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const { start, end } = useMemo(() => {
    if (preset === 'this_month') return { start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), end: ymd(now) };
    if (preset === 'this_week') return { start: ymd(startOfWeek(now)), end: ymd(now) };
    return { start: null as string | null, end: null as string | null };
  }, [preset, now]);

  const periodEntries = useMemo(() => records.filter((r) => {
    if (!r.values.staff) return false;
    const date = String(r.values.date || '').slice(0, 10);
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }), [records, start, end]);

  const { rows, entriesByGroup } = useMemo(() => {
    const byGroup = new Map<string, { hours: number; billableHours: number; amount: number; count: number; label: string }>();
    const entries = new Map<string, CustomTableRecord[]>();
    for (const r of periodEntries) {
      const date = String(r.values.date || '').slice(0, 10);
      const key = groupBy === 'time' ? date : String(r.values.staff || '');
      const label = groupBy === 'time' ? new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : (r.displayValues?.staff || key.slice(0, 8));
      const hours = Number(r.values.duration_hours) || 0;
      const amount = Number(r.values.amount) || 0;
      const entry = byGroup.get(key) || { hours: 0, billableHours: 0, amount: 0, count: 0, label };
      entry.hours += hours;
      if (r.values.billable) entry.billableHours += hours;
      entry.amount += amount;
      entry.count += 1;
      byGroup.set(key, entry);
      const list = entries.get(key) || [];
      list.push(r);
      entries.set(key, list);
    }
    for (const list of entries.values()) list.sort((a, b) => String(b.values.date || '').localeCompare(String(a.values.date || '')));
    const rows = [...byGroup.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => (groupBy === 'time' ? b.key.localeCompare(a.key) : b.hours - a.hours));
    return { rows, entriesByGroup: entries };
  }, [periodEntries, groupBy]);

  const flatEntries = useMemo(() => [...periodEntries].sort((a, b) => String(b.values.date || '').localeCompare(String(a.values.date || ''))), [periodEntries]);

  const totals = useMemo(() => periodEntries.reduce((acc, r) => {
    const hours = Number(r.values.duration_hours) || 0;
    return {
      hours: acc.hours + hours,
      billableHours: acc.billableHours + (r.values.billable ? hours : 0),
      amount: acc.amount + (Number(r.values.amount) || 0),
      count: acc.count + 1,
    };
  }, { hours: 0, billableHours: 0, amount: 0, count: 0 }), [periodEntries]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <Clock size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Time & Fees Report</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
            {groupBy === 'time' ? 'Time recorded per day' : groupBy === 'entries' ? 'Every entry recorded' : 'Time recorded per staff member'}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <PillGroup options={['timekeeper', 'time', 'entries']} labels={GROUP_LABELS} value={groupBy} onChange={(v) => { setGroupBy(v); setExpandedKey(null); }} />
        <PillGroup options={['this_month', 'this_week', 'all_time']} labels={PRESET_LABELS} value={preset} onChange={setPreset} />
      </ScrollView>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {groupBy === 'entries' ? (
          <>
            {flatEntries.map((entry) => <EntryRow key={entry.id} entry={entry} showStaff />)}
            {flatEntries.length === 0 && <Text style={styles.emptyText}>No time recorded in this period</Text>}
          </>
        ) : (
          rows.map((r) => {
            const isExpanded = expandedKey === r.key;
            return (
              <View key={r.key}>
                <Pressable onPress={() => setExpandedKey(isExpanded ? null : r.key)} style={[styles.groupRow, { borderColor: theme.border }]}>
                  {isExpanded ? <ChevronDown size={13} color={theme.textSecondary} /> : <ChevronRight size={13} color={theme.textSecondary} />}
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '700', flex: 1 }}>{r.label}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{r.hours.toFixed(1)}h</Text>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(r.amount)}</Text>
                </Pressable>
                {isExpanded && (
                  <View style={styles.expandedGroup}>
                    {(entriesByGroup.get(r.key) || []).map((entry) => <EntryRow key={entry.id} entry={entry} showStaff={groupBy === 'time'} />)}
                  </View>
                )}
              </View>
            );
          })
        )}
        {groupBy !== 'entries' && rows.length === 0 && <Text style={styles.emptyText}>No time recorded in this period</Text>}
        {((groupBy === 'entries' && flatEntries.length > 0) || (groupBy !== 'entries' && rows.length > 0)) && (
          <View style={[styles.totalsRow, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800', flex: 1 }}>Total ({totals.count})</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginRight: 8 }}>{totals.hours.toFixed(1)}h</Text>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{formatCurrency(totals.amount)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillGroup: { flexDirection: 'row', borderRadius: Radii.pill, padding: 2 },
  pillOption: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.pill },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 8, gap: 6 },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
  entryRow: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 6 },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  initialsBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  billableBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.pill },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1 },
  expandedGroup: { padding: 6, gap: 6 },
  totalsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginTop: 2, borderTopWidth: 1 },
});
