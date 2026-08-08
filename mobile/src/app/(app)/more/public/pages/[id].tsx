import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useCompanyPage } from '@/lib/companyPages';
import { PageBlocks } from '@/components/pages/PageBlockRenderer';

// Native staff view of a company_pages row -- unlike the other two Shared
// Pages screens (document/client-update), there's no separate "public vs
// staff" fetch here at all: GET /api/pages/[id] is authenticated +
// company-scoped and returns the real blocks regardless of the page's
// visibility ('company'/'client'/'public'), since a page's CONTENT never
// differs by viewer, only who's allowed to reach it externally. This is
// the same route web's own Settings editor/preview already uses.
export default function CompanyPageDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: page, isLoading, error } = useCompanyPage(id);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !page) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>{error instanceof Error ? error.message : 'Page not found.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: page.title }} />
      <Text style={[styles.title, { color: theme.text }]}>{page.title}</Text>
      <PageBlocks blocks={page.blocks} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800' },
});
