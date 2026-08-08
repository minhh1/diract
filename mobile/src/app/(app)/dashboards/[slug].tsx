import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { APP_URL } from '@/lib/config';
import { MaxContentWidth, Radii } from '@/constants/theme';
import { useCompanyDashboard } from '@/lib/companyDashboards';
import { useIsTabletLayout } from '@/hooks/use-tablet-layout';
import { DashboardWidgetRenderer } from '@/components/dashboard/DashboardWidgetRenderer';

// Widgets render top-to-bottom in row order (layout.y, then layout.x as a
// tiebreaker) on phone -- the web builder's react-grid-layout columns
// don't carry over to a single-column phone screen, so this flattens to a
// feed instead of attempting the same multi-column layout. On iPad,
// layout.w (the web's 12-column span) drives an actual flexWrap grid
// instead -- see the isTablet branch below. This is a best-effort
// left-to-right wrap of the sorted array, not true (x,y) cell placement,
// so a web author's precise multi-row gap arrangement may not be
// pixel-perfect here -- acceptable for v1, exact grid placement is a
// documented follow-up.
export default function DashboardViewScreen() {
  const theme = useTheme();
  const isTablet = useIsTabletLayout();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { profile } = useSession();
  const { dashboard, isLoading, sourceSupported, fields, fieldById, records, tableName, customTableId, companyId, rawFields } = useCompanyDashboard(
    slug,
    profile?.active_company_id ?? null,
  );
  // Keyed by field id, same shape as web's useDashboardData filter state --
  // shared across every widget on this screen (a filter_bar's pill narrows
  // whatever grid/summary_tile/chart widgets are also on this dashboard).
  const [filters, setFilters] = useState<Record<string, any>>({});
  const setFilter = (fieldId: string, value: any) => setFilters((prev) => ({ ...prev, [fieldId]: value }));
  // Set by my_tasks_button's "Convert", consumed once by quick_add_form --
  // see CustomTableQuickAddForm.tsx's prefill prop.
  const [quickAddPrefill, setQuickAddPrefill] = useState<Record<string, unknown> | null>(null);
  // iPad grid only -- tapping a widget's expand icon shows just that one
  // widget at full width instead of its authored grid span, tapping again
  // (now a collapse icon) restores the full grid.
  const [expandedWidgetId, setExpandedWidgetId] = useState<string | null>(null);

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
        <Stack.Screen options={{ title: dashboard.name }} />
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          This dashboard has no table backing it, which the mobile app doesn't render yet. View it on the web dashboard instead.
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
        <Stack.Screen options={{ title: dashboard.name }} />
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          Open this dashboard on the web once to upgrade it to the current format, then it will show up here too.
        </Text>
      </View>
    );
  }

  const sortedWidgets = [...widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const visibleWidgets = expandedWidgetId ? sortedWidgets.filter((w) => w.id === expandedWidgetId) : sortedWidgets;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={isTablet ? styles.gridContent : styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      <Stack.Screen options={{ title: dashboard.name }} />
      <View style={isTablet ? styles.grid : undefined}>
        {visibleWidgets.map((widget) => {
          const expanded = widget.id === expandedWidgetId;
          return (
            <View
              key={widget.id}
              style={[
                isTablet
                  ? { width: expanded ? '100%' : `${(Math.min(widget.layout.w, 12) / 12) * 100}%` }
                  : widget.type === 'summary_tile'
                    ? undefined
                    : styles.fullWidth,
                isTablet && styles.gridCell,
              ]}
            >
              <DashboardWidgetRenderer
                widget={widget}
                records={records}
                fields={fields}
                fieldById={fieldById}
                filters={filters}
                onFilterChange={setFilter}
                dashboardSlug={slug}
                dashboardId={dashboard.id}
                tableName={tableName}
                customTableId={customTableId}
                companyId={companyId}
                userId={profile?.id ?? null}
                rawFields={rawFields}
                quickAddPrefill={quickAddPrefill}
                onQuickAddPrefill={setQuickAddPrefill}
              />
              {isTablet && (
                <Pressable
                  onPress={() => setExpandedWidgetId(expanded ? null : widget.id)}
                  accessibilityLabel={expanded ? 'Collapse to grid' : 'Expand to full view'}
                  style={[styles.widgetExpandButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                >
                  {expanded ? (
                    <Minimize2 size={13} color={theme.textSecondary} />
                  ) : (
                    <Maximize2 size={13} color={theme.textSecondary} />
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  fullWidth: { width: '100%' },
  openWebButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  gridContent: { padding: 10, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { padding: 6 },
  widgetExpandButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
