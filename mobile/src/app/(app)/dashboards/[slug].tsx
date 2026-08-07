import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { APP_URL } from '@/lib/config';
import { useCompanyDashboard } from '@/lib/companyDashboards';
import { DashboardWidgetRenderer } from '@/components/dashboard/DashboardWidgetRenderer';

// Widgets render top-to-bottom in row order (layout.y, then layout.x as a
// tiebreaker) -- the web builder's react-grid-layout columns don't carry
// over to a single-column phone screen, so this flattens to a feed instead
// of attempting the same multi-column layout.
export default function DashboardViewScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { profile } = useSession();
  const { dashboard, isLoading, sourceSupported, fieldById, records, tableName, companyId, rawFields } = useCompanyDashboard(
    slug,
    profile?.active_company_id ?? null,
  );

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Dashboard not found.</Text>
      </View>
    );
  }

  if (!sourceSupported) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, gap: 12, paddingHorizontal: 32 }]}>
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          This dashboard is built on a custom table, which the mobile app does not read schema for yet. View it on the web dashboard instead.
        </Text>
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/dashboard/boards/${slug}`)}
          style={[styles.openWebButton, { borderColor: theme.border }]}
        >
          <ExternalLink size={14} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Open on web</Text>
        </Pressable>
      </View>
    );
  }

  const widgets = dashboard.widgets ?? [];
  if (widgets.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, paddingHorizontal: 32 }]}>
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          Open this dashboard on the web once to upgrade it to the current format, then it will show up here too.
        </Text>
      </View>
    );
  }

  const sortedWidgets = [...widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {sortedWidgets.map((widget) => (
        <View key={widget.id} style={widget.type === 'summary_tile' ? undefined : styles.fullWidth}>
          <DashboardWidgetRenderer
            widget={widget}
            records={records}
            fieldById={fieldById}
            dashboardSlug={slug}
            tableName={tableName}
            companyId={companyId}
            rawFields={rawFields}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  fullWidth: { width: '100%' },
  openWebButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
});
