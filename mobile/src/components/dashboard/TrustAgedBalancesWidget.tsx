import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import { computeTrustBalancesByMatter } from '@/lib/trust/trustBalances';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Native port of components/dashboard/TrustAgedBalancesWidget.tsx -- every
// matter with a live (non-zero) trust balance whose last transaction is
// older than dormantDays. Uses the SAME shared computeTrustBalancesByMatter
// (lib/trust/trustBalances.ts, ported verbatim) web's version does, not a
// second implementation -- see that file's own header comment for why.
// v1 gap: no "Print"/PDF export, tracked with the other trust widgets'
// file-sharing needs.
export function TrustAgedBalancesWidget({ records, dormantDays }: { records: CustomTableRecord[]; dormantDays: number }) {
  const theme = useTheme();

  const balances = useMemo(() => {
    const now = Date.now();
    const matterLabelById = new Map<string, string>();
    for (const r of records) {
      const id = String(r.values.matter || '');
      if (id && !matterLabelById.has(id)) matterLabelById.set(id, r.displayValues?.matter || id.slice(0, 8));
    }
    return computeTrustBalancesByMatter(records)
      .filter((v) => Math.abs(v.balance) >= 0.005)
      .map((v) => ({
        matterId: v.matterId,
        matterLabel: matterLabelById.get(v.matterId) || v.matterId.slice(0, 8),
        balance: v.balance,
        lastDate: v.lastDate,
        daysDormant: v.lastDate ? Math.floor((now - new Date(v.lastDate).getTime()) / MS_PER_DAY) : Infinity,
      }))
      .filter((b) => b.daysDormant >= dormantDays)
      .sort((a, b) => b.daysDormant - a.daysDormant);
  }, [records, dormantDays]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.dangerBackground }]}>
          <AlertTriangle size={16} color={theme.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Dormant Trust Balances</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Live balance, no transaction for {dormantDays}+ days</Text>
        </View>
        {balances.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: theme.dangerBackground }]}>
            <Text style={{ color: theme.danger, fontSize: 10, fontWeight: '800' }}>{balances.length}</Text>
          </View>
        )}
      </View>

      <ScrollView nestedScrollEnabled style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} contentContainerStyle={{ gap: 8 }}>
        {balances.map((b) => (
          <View key={b.matterId} style={[styles.itemRow, { borderColor: theme.border, backgroundColor: theme.dangerBackground }]}>
            <View style={styles.itemTopRow}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '700', flex: 1 }}>{b.matterLabel}</Text>
              <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '800' }}>{Number.isFinite(b.daysDormant) ? `${b.daysDormant}d` : '-'}</Text>
            </View>
            <View style={styles.itemBottomRow}>
              <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Last: {b.lastDate ? new Date(b.lastDate).toLocaleDateString('en-AU') : '-'}</Text>
              <Text style={{ color: b.balance < 0 ? theme.danger : theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(b.balance)}</Text>
            </View>
          </View>
        ))}
        {balances.length === 0 && <Text style={styles.emptyText}>No dormant trust balances</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.pill },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 10, maxHeight: 320 },
  itemRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
});
