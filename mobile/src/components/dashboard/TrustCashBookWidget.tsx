import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BookOpen } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfMonth(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

// Native port of components/dashboard/TrustCashBookWidget.tsx -- every
// transaction across every matter, in date order, for a chosen period,
// with a whole-account running total (opening balance carried in from
// everything before the period, then cumulative row by row). Same
// aggregation math ported 1:1 from web. v1 gap: no "Print"/PDF export --
// tracked with ledes_export/document_export/invoice_import, which all need
// the same file-sharing infra.
export function TrustCashBookWidget({ records }: { records: CustomTableRecord[] }) {
  const theme = useTheme();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(ymd(new Date()));
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);

  const sorted = useMemo(() => records.slice().sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || ''))), [records]);

  const { openingBalance, rows, periodIn, periodOut } = useMemo(() => {
    let openingBalance = 0;
    const rows: { record: CustomTableRecord; running: number }[] = [];
    let periodIn = 0, periodOut = 0;
    for (const r of sorted) {
      const date = String(r.values.date || '').slice(0, 10);
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      if (date && date < from) { openingBalance += inAmt - outAmt; continue; }
      if (!date || date > to) continue;
      const running = (rows.length ? rows[rows.length - 1].running : openingBalance) + inAmt - outAmt;
      periodIn += inAmt;
      periodOut += outAmt;
      rows.push({ record: r, running });
    }
    return { openingBalance, rows, periodIn, periodOut };
  }, [sorted, from, to]);

  const closingBalance = rows.length ? rows[rows.length - 1].running : openingBalance;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <BookOpen size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Trust Cash Book</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>All transactions, with a whole-account running total</Text>
        </View>
      </View>

      <View style={styles.dateRow}>
        <Pressable onPress={() => setPickerTarget('from')} style={[styles.dateButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{new Date(`${from}T00:00:00`).toLocaleDateString('en-AU')}</Text>
        </Pressable>
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>to</Text>
        <Pressable onPress={() => setPickerTarget('to')} style={[styles.dateButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{new Date(`${to}T00:00:00`).toLocaleDateString('en-AU')}</Text>
        </Pressable>
      </View>
      {pickerTarget && (
        <DateTimePicker
          value={new Date(`${pickerTarget === 'from' ? from : to}T00:00:00`)}
          mode="date"
          onChange={(_event, selected) => {
            const target = pickerTarget;
            setPickerTarget(null);
            if (!selected) return;
            const value = ymd(selected);
            if (target === 'from') setFrom(value); else setTo(value);
          }}
        />
      )}

      <ScrollView nestedScrollEnabled style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} contentContainerStyle={{ gap: 8 }}>
        <View style={[styles.entryRow, { borderColor: theme.border, opacity: 0.7 }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 11, fontStyle: 'italic', flex: 1 }}>Opening balance (before {new Date(`${from}T00:00:00`).toLocaleDateString('en-AU')})</Text>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{formatCurrency(openingBalance)}</Text>
        </View>
        {rows.map(({ record: r, running }) => (
          <View key={r.id} style={[styles.entryRow, { borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{new Date(String(r.values.date || '').slice(0, 10)).toLocaleDateString('en-AU')}</Text>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{r.displayValues?.matter || '-'}</Text>
              <Text numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 11 }}>{String(r.values.payor_payee || r.values.purpose || '-')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                {r.values.amount_in ? `+${formatCurrency(Number(r.values.amount_in))}` : r.values.amount_out ? `-${formatCurrency(Number(r.values.amount_out))}` : ''}
              </Text>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(running)}</Text>
            </View>
          </View>
        ))}
        {rows.length === 0 && <Text style={styles.emptyText}>No trust transactions in this period</Text>}
        <View style={[styles.totalsRow, { borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800', flex: 1 }}>Period totals</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginRight: 10 }}>In {formatCurrency(periodIn)}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginRight: 10 }}>Out {formatCurrency(periodOut)}</Text>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(closingBalance)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateButton: { flex: 1, borderWidth: 1, borderRadius: Radii.pill, paddingVertical: 10, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 10, maxHeight: 400 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, paddingTop: 8 },
  totalsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 1 },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
});
