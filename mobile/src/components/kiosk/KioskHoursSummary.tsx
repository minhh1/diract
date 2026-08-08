import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { callApi } from '@/lib/api';

// Native port of components/kiosk/HoursSummaryPanel.tsx (web) -- same
// /api/kiosk/checkins/summary endpoint, re-fetched whenever the visible
// date range (start/end) changes.
type StaffHours = { staff_entity_id: string; name: string; hours: number };

export function KioskHoursSummary({ start, end }: { start: string; end: string }) {
  const theme = useTheme();
  const [summary, setSummary] = useState<StaffHours[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    callApi(`/api/kiosk/checkins/summary?start=${start}&end=${end}`)
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setSummary(json.summary ?? []); })
      .catch(() => { if (!cancelled) setSummary([]); });
    return () => { cancelled = true; };
  }, [start, end]);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Clock size={13} color={theme.textSecondary} />
        <Text style={[styles.headerText, { color: theme.textSecondary }]}>HOURS WORKED</Text>
      </View>
      {summary === null ? (
        <View style={styles.center}><ActivityIndicator color={theme.textSecondary} /></View>
      ) : summary.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No check-ins recorded in this period.</Text>
      ) : (
        summary.map((s) => (
          <View key={s.staff_entity_id} style={[styles.row, { borderTopColor: theme.border }]}>
            <Text style={[styles.name, { color: theme.text }]}>{s.name}</Text>
            <Text style={[styles.hours, { color: theme.text }]}>{s.hours.toFixed(1)}h</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radii.card, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  center: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 12, fontWeight: '500' },
  hours: { fontSize: 12, fontWeight: '700' },
});
