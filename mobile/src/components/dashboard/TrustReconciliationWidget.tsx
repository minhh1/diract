import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle, CheckCircle2, Landmark } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

// r 48(3): reconciliation statements must be prepared within 15 working
// days after the end of the month -- verbatim port of the same
// weekday-only approximation web's TrustReconciliationWidget.tsx uses (see
// its own comment: the real deadline, accounting for public holidays,
// can only be EARLIER than this, never later, so this stays a safe bound).
function reconciliationDeadline(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  let remaining = 15;
  while (remaining > 0) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining -= 1;
    if (remaining > 0) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// Native port of components/dashboard/TrustReconciliationWidget.tsx -- the
// three-way monthly trust reconciliation required under the Legal
// Profession Uniform General Rules 2015 r 48. Same field_key convention as
// every other trust widget (date/matter/amount_in/amount_out), and the
// exact same aggregation math ported 1:1 -- this is a compliance document,
// not just a UI, so it must produce identical figures to the web version
// given the same records.
export function TrustReconciliationWidget({ records }: { records: CustomTableRecord[] }) {
  const theme = useTheme();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bankBalance, setBankBalance] = useState('');

  const monthEnd = `${month}-31`;

  const { receipts, payments, cashBookClosing, ledgers } = useMemo(() => {
    let receipts = 0, payments = 0, cashBookClosing = 0;
    const ledgers = new Map<string, { balance: number; entries: number; label: string }>();
    for (const r of records) {
      const date = String(r.values.date || '').slice(0, 10);
      if (!date || date > monthEnd) continue;
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      cashBookClosing += inAmt - outAmt;
      if (date.slice(0, 7) === month) { receipts += inAmt; payments += outAmt; }
      const matter = String(r.values.matter || '');
      if (matter) {
        const entry = ledgers.get(matter) || { balance: 0, entries: 0, label: r.displayValues?.matter || matter.slice(0, 8) };
        entry.balance += inAmt - outAmt;
        entry.entries += 1;
        ledgers.set(matter, entry);
      }
    }
    return { receipts, payments, cashBookClosing, ledgers };
  }, [records, month, monthEnd]);

  const trialBalanceTotal = [...ledgers.values()].reduce((s, l) => s + l.balance, 0);
  const ledgersReconcile = Math.abs(trialBalanceTotal - cashBookClosing) < 0.005;
  const bank = bankBalance === '' ? null : Number(bankBalance);
  const bankVariance = bank === null || Number.isNaN(bank) ? null : bank - cashBookClosing;
  const deadline = reconciliationDeadline(month);
  const trustYearEndYear = Number(month.slice(0, 4)) + (month.slice(5, 7) > '03' ? 1 : 0);
  const sortedLedgers = useMemo(() => [...ledgers.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label)), [ledgers]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <Landmark size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Trust Reconciliation</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Three-way reconciliation under Uniform General Rules 2015 r 48</Text>
        </View>
      </View>

      <Pressable onPress={() => setPickerOpen(true)} style={[styles.monthButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{new Date(`${month}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</Text>
      </Pressable>
      {pickerOpen && (
        <DateTimePicker
          value={new Date(`${month}-01T00:00:00`)}
          mode="date"
          onChange={(_event, selected) => {
            setPickerOpen(false);
            if (selected) setMonth(selected.toISOString().slice(0, 7));
          }}
        />
      )}

      <View style={[styles.warningBanner, { backgroundColor: theme.dangerBackground }]}>
        <AlertTriangle size={13} color={theme.danger} />
        <Text style={{ color: theme.textSecondary, fontSize: 10.5, flex: 1, lineHeight: 15 }}>
          Must be prepared by{' '}
          <Text style={{ fontWeight: '800' }}>{deadline.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</Text>.
          Trust year ends 31 March {trustYearEndYear}; examiner's report due 31 May {trustYearEndYear}.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Text style={styles.sectionLabel}>1 · Trust cash book ({month})</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={{ color: theme.textSecondary, fontSize: 9 }}>Receipts</Text>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{formatCurrency(receipts)}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={{ color: theme.textSecondary, fontSize: 9 }}>Payments</Text>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{formatCurrency(payments)}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={{ color: theme.textSecondary, fontSize: 9 }}>Closing balance</Text>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{formatCurrency(cashBookClosing)}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>2 · Trial balance of trust ledgers</Text>
          {ledgersReconcile ? (
            <View style={styles.matchBadgeRow}><CheckCircle2 size={11} color={theme.success} /><Text style={{ color: theme.success, fontSize: 9, fontWeight: '800' }}>Matches</Text></View>
          ) : (
            <View style={styles.matchBadgeRow}><AlertTriangle size={11} color={theme.danger} /><Text style={{ color: theme.danger, fontSize: 9, fontWeight: '800' }}>Mismatch</Text></View>
          )}
        </View>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
          {sortedLedgers.map(([matterId, ledger]) => (
            <View key={matterId} style={[styles.ledgerRow, { borderColor: theme.border }]}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '600', flex: 1 }}>{ledger.label}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginRight: 8 }}>{ledger.entries}</Text>
              <Text style={{ color: ledger.balance < 0 ? theme.danger : theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(ledger.balance)}</Text>
            </View>
          ))}
          {ledgers.size === 0 && <Text style={styles.emptyText}>No trust transactions up to this month</Text>}
        </ScrollView>
        {ledgers.size > 0 && (
          <View style={[styles.totalsRow, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800', flex: 1 }}>Total</Text>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{formatCurrency(trialBalanceTotal)}</Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Text style={styles.sectionLabel}>3 · Trust bank statement</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Statement closing balance at end of {month}</Text>
        <TextInput
          value={bankBalance}
          onChangeText={setBankBalance}
          placeholder="0.00"
          keyboardType="decimal-pad"
          style={[styles.bankInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
        />
        {bankVariance !== null && (
          Math.abs(bankVariance) < 0.005 ? (
            <View style={styles.matchBadgeRow}><CheckCircle2 size={13} color={theme.success} /><Text style={{ color: theme.success, fontSize: 12, fontWeight: '800' }}>Reconciles with the cash book</Text></View>
          ) : (
            <View style={styles.matchBadgeRow}>
              <AlertTriangle size={13} color={theme.danger} />
              <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '800', flex: 1 }}>
                Variance of {formatCurrency(bankVariance)} vs cash book. Identify unpresented cheques / outstanding deposits, or investigate.
              </Text>
            </View>
          )
        )}
        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Any deficiency or irregularity must be reported to the regulator as soon as practicable.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  monthButton: { borderWidth: 1, borderRadius: Radii.pill, paddingVertical: 10, alignItems: 'center' },
  warningBanner: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, alignItems: 'flex-start' },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 14, gap: 10 },
  sectionLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCell: { flex: 1, gap: 2 },
  matchBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1 },
  totalsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 1 },
  bankInput: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '600' },
  emptyText: { textAlign: 'center', paddingVertical: 16, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
});
