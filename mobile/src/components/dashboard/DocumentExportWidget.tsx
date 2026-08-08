import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FileOutput, Settings2 } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_URL } from '@/lib/config';
import type { DocumentExportWidget as DocumentExportWidgetConfig } from '@/lib/dashboardWidgets/types';
import type { CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';

// Native port of components/dashboard/DocumentExportWidget.tsx -- same
// shape as LedesExportWidget.tsx (list + per-row download), just not tied
// to a fixed field_key contract. The generated PDF (app/api/document-export/
// [dashboardId]/[widgetId]/[recordId]) opens in the system browser --
// see LedesExportWidget.tsx's header comment for why (an in-app
// download/share needs new native deps this app doesn't have yet).
export function DocumentExportWidget({
  records,
  config,
  dashboardId,
  widgetId,
}: {
  records: CustomTableRecord[];
  config: DocumentExportWidgetConfig['config'];
  dashboardId: string | null;
  widgetId: string;
}) {
  const theme = useTheme();
  const isLetter = config.style === 'letter';
  const configured = isLetter
    ? !!config.letter?.bodyFieldId
    : !!(config.invoice?.descriptionFieldId || config.invoice?.amountFieldId || config.invoice?.totalFieldId);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <FileOutput size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>Document export ({isLetter ? 'letter' : 'invoice'} style)</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
            {isLetter ? "Renders each record onto the company's letterhead" : 'Renders each record as a generic invoice-style PDF'}
          </Text>
        </View>
      </View>

      {!dashboardId ? (
        <Text style={styles.emptyText}>Save this dashboard on web to enable exports</Text>
      ) : !configured ? (
        <View style={[styles.warningBanner, { backgroundColor: theme.dangerBackground }]}>
          <Settings2 size={13} color={theme.danger} />
          <Text style={{ color: theme.textSecondary, fontSize: 11, flex: 1 }}>This widget needs its fields mapped on web before it can export anything.</Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {records.map((r) => (
            <View key={r.id} style={[styles.row, { borderColor: theme.border }]}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '600', flex: 1 }}>{r.id.slice(0, 8).toUpperCase()}</Text>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/api/document-export/${dashboardId}/${widgetId}/${r.id}`)}
                style={[styles.exportButton, { backgroundColor: theme.backgroundSelected }]}
              >
                <FileOutput size={11} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '800' }}>Export PDF</Text>
              </Pressable>
            </View>
          ))}
          {records.length === 0 && <Text style={styles.emptyText}>No records yet</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  warningBanner: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, alignItems: 'flex-start' },
  card: { borderWidth: 1, borderRadius: Radii.card, padding: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.pill },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
});
