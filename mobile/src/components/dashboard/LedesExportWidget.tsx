import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileDown } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openOnWeb } from '@/lib/webHandoff';
import { formatCurrency } from '@/lib/format';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

// Native port of components/dashboard/LedesExportWidget.tsx -- the list
// renders fully natively; the actual LEDES file (built server-side by
// app/api/ledes/[recordId]/route.ts) opens in the system browser rather
// than downloading in-app. Same "open on web" fallback this app already
// uses elsewhere, scoped to just the download action instead of the whole
// widget -- an in-app download/share needs expo-file-system/expo-sharing
// (new native deps, tracked with document_export/invoice_import, which
// need the same infra).
export function LedesExportWidget({ records }: { records: CustomTableRecord[] }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <FileDown size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>LEDES Export</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>LEDES 1998B e-billing files, per invoice</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {records.map((r) => (
          <View key={r.id} style={[styles.row, { borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{String(r.values.invoice_number || '-')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                {r.values.issue_date ? new Date(String(r.values.issue_date).slice(0, 10)).toLocaleDateString('en-AU') : '-'} · {String(r.values.status || '-')}
              </Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700', marginRight: 10 }}>
              {r.values.total_inc_gst != null && r.values.total_inc_gst !== '' ? formatCurrency(Number(r.values.total_inc_gst) || 0) : '-'}
            </Text>
            <Pressable
              onPress={() => openOnWeb(`/api/ledes/${r.id}`)}
              style={[styles.downloadButton, { backgroundColor: theme.backgroundSelected }]}
            >
              <FileDown size={11} color={theme.accent} />
              <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '800' }}>LEDES</Text>
            </Pressable>
          </View>
        ))}
        {records.length === 0 && <Text style={styles.emptyText}>No invoices yet</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
  downloadButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.pill },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
});
