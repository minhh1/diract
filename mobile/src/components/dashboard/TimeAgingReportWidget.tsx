import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AGING_OPTIONS = [5, 10, 15, 30];

interface AgedItem {
  recordId: string;
  matterLabel: string;
  staffLabel: string;
  date: string;
  description: string;
  hours: number;
  daysUnbilled: number;
}

// Native port of components/dashboard/TimeAgingReportWidget.tsx -- same
// client-side filter over already-resolved `records` as
// TimeFeesReportWidget.tsx. entry.displayValues.matter already carries the
// matter number prefix (relationResolution.ts), so there's no separate
// "prefer number over name" branch to replicate from web's matterLabel --
// this always shows both, which is strictly more informative.
export function TimeAgingReportWidget({ records, agingDays }: { records: CustomTableRecord[]; agingDays: number }) {
  const theme = useTheme();
  const [view, setView] = useState<'times' | 'matters'>('times');
  const [selectedAgingDays, setSelectedAgingDays] = useState(() => (AGING_OPTIONS.includes(agingDays) ? agingDays : AGING_OPTIONS[AGING_OPTIONS.length - 1]));

  const items = useMemo(() => {
    const now = Date.now();
    const out: AgedItem[] = [];
    for (const r of records) {
      if (r.values.invoice) continue;
      if (r.values.status === 'Written Off') continue;
      const matterId = String(r.values.matter || '');
      const date = String(r.values.date || '').slice(0, 10);
      if (!matterId || !date) continue;
      const daysUnbilled = Math.floor((now - new Date(date).getTime()) / MS_PER_DAY);
      if (daysUnbilled < selectedAgingDays) continue;
      out.push({
        recordId: r.id,
        matterLabel: r.displayValues?.matter || matterId.slice(0, 8),
        staffLabel: r.displayValues?.staff || '-',
        date,
        description: String(r.values.description || ''),
        hours: Number(r.values.duration_hours) || 0,
        daysUnbilled,
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [records, selectedAgingDays]);

  const matterRows = useMemo(() => {
    const byMatter = new Map<string, { matterLabel: string; oldestDate: string; daysUnbilled: number; count: number; hours: number }>();
    for (const it of items) {
      const existing = byMatter.get(it.matterLabel);
      if (!existing) byMatter.set(it.matterLabel, { matterLabel: it.matterLabel, oldestDate: it.date, daysUnbilled: it.daysUnbilled, count: 1, hours: it.hours });
      else { existing.count += 1; existing.hours += it.hours; }
    }
    return [...byMatter.values()].sort((a, b) => a.oldestDate.localeCompare(b.oldestDate));
  }, [items]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.dangerBackground }]}>
          <AlertTriangle size={16} color={theme.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Old Time ({selectedAgingDays}+ days unbilled)</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Time not yet invoiced, oldest first</Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {AGING_OPTIONS.map((days) => (
            <Pressable
              key={days}
              onPress={() => setSelectedAgingDays(days)}
              style={[styles.chip, { backgroundColor: selectedAgingDays === days ? theme.danger : theme.backgroundSelected }]}
            >
              <Text style={{ color: selectedAgingDays === days ? '#fff' : theme.textSecondary, fontSize: 10, fontWeight: '800' }}>{days}d</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={[styles.pillGroup, { backgroundColor: theme.backgroundSelected }]}>
          {(['times', 'matters'] as const).map((v) => (
            <Pressable key={v} onPress={() => setView(v)} style={[styles.pillOption, view === v && { backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: view === v ? theme.accent : theme.textSecondary, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' }}>{v}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView nestedScrollEnabled style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} contentContainerStyle={styles.cardContent}>
        {view === 'times' ? (
          <>
            {items.map((it) => (
              <View key={it.recordId} style={[styles.itemRow, { borderColor: theme.border }]}>
                <View style={styles.entryTopRow}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '700', flex: 1 }}>{it.matterLabel}</Text>
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '800' }}>{it.daysUnbilled}d</Text>
                </View>
                <Text numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 11 }}>{it.description || 'No description'}</Text>
                <View style={styles.entryBottomRow}>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{it.staffLabel}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{new Date(it.date).toLocaleDateString('en-AU')}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{it.hours.toFixed(1)}h</Text>
                </View>
              </View>
            ))}
            {items.length === 0 && <Text style={styles.emptyText}>Nothing unbilled past {selectedAgingDays} days</Text>}
          </>
        ) : (
          <>
            {matterRows.map((m) => (
              <View key={m.matterLabel} style={[styles.itemRow, { borderColor: theme.border }]}>
                <View style={styles.entryTopRow}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '700', flex: 1 }}>{m.matterLabel}</Text>
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '800' }}>{m.daysUnbilled}d</Text>
                </View>
                <View style={styles.entryBottomRow}>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Oldest: {new Date(m.oldestDate).toLocaleDateString('en-AU')}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{m.count} entries</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{m.hours.toFixed(1)}h</Text>
                </View>
              </View>
            ))}
            {matterRows.length === 0 && <Text style={styles.emptyText}>Nothing unbilled past {selectedAgingDays} days</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.pill },
  pillGroup: { flexDirection: 'row', borderRadius: Radii.pill, padding: 2 },
  pillOption: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.pill },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 8, maxHeight: 320 },
  cardContent: { gap: 6 },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
  itemRow: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 4 },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
