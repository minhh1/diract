import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

// Native port of components/dashboard/TrustLedgerStatementWidget.tsx --
// every transaction for one matter, in date order, with running_balance
// (precomputed server-side at insert time by insert_ledger_record, see
// supabase/company_table_ledger.sql -- this just displays it, no
// recomputation). v1 gap: no "Print" -- that needs the same file-sharing
// infra as ledes_export/document_export/invoice_import, tracked together.
export function TrustLedgerStatementWidget({ records }: { records: CustomTableRecord[] }) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMatter, setSelectedMatter] = useState<string>('');

  const matterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of records) {
      const id = String(r.values.matter || '');
      if (id && !byId.has(id)) byId.set(id, r.displayValues?.matter || id.slice(0, 8));
    }
    return [...byId.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const entries = useMemo(() => {
    if (!selectedMatter) return [];
    return records.filter((r) => String(r.values.matter || '') === selectedMatter).slice()
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
  }, [records, selectedMatter]);

  const totals = entries.reduce((acc, r) => ({
    in: acc.in + (Number(r.values.amount_in) || 0),
    out: acc.out + (Number(r.values.amount_out) || 0),
  }), { in: 0, out: 0 });
  const closingBalance = entries.length ? Number(entries[entries.length - 1].values.running_balance) || 0 : 0;
  const selectedLabel = matterOptions.find((m) => m.id === selectedMatter)?.label;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <FileText size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Trust Ledger Statement</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>Every transaction for one matter, with running balance</Text>
        </View>
      </View>

      <Pressable onPress={() => setPickerOpen(true)} style={[styles.matterButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <Text style={{ color: selectedLabel ? theme.text : theme.textSecondary, fontSize: 13, fontWeight: '700' }}>{selectedLabel || 'Select a matter...'}</Text>
      </Pressable>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
            <ScrollView style={{ maxHeight: 400 }}>
              {matterOptions.map((m) => (
                <Pressable key={m.id} onPress={() => { setSelectedMatter(m.id); setPickerOpen(false); }} style={[styles.sheetRow, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{m.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {!selectedMatter ? (
        <Text style={styles.emptyText}>Select a matter above to view its trust ledger statement</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {entries.map((r) => (
            <View key={r.id} style={[styles.entryRow, { borderColor: theme.border }]}>
              <View style={styles.entryTopRow}>
                <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{new Date(String(r.values.date || '').slice(0, 10)).toLocaleDateString('en-AU')}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 10, fontFamily: 'monospace' }}>{String(r.values.receipt_number || '-')}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
                {String(r.values.payor_payee || r.values.purpose || '-')}
              </Text>
              <View style={styles.entryBottomRow}>
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                  {r.values.amount_in ? `+${formatCurrency(Number(r.values.amount_in))}` : r.values.amount_out ? `-${formatCurrency(Number(r.values.amount_out))}` : ''}
                </Text>
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(Number(r.values.running_balance) || 0)}</Text>
              </View>
            </View>
          ))}
          {entries.length === 0 && <Text style={styles.emptyText}>No trust transactions for this matter</Text>}
          {entries.length > 0 && (
            <View style={[styles.totalsRow, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800', flex: 1 }}>Totals</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginRight: 10 }}>In {formatCurrency(totals.in)}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginRight: 10 }}>Out {formatCurrency(totals.out)}</Text>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{formatCurrency(closingBalance)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  matterButton: { borderWidth: 1, borderRadius: Radii.pill, paddingVertical: 12, paddingHorizontal: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, paddingVertical: 12 },
  sheetRow: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1 },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 10, gap: 8 },
  entryRow: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  entryTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 1 },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
});
