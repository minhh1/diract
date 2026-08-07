import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as LucideIcons from 'lucide-react-native';
import { LayoutDashboard, type LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useCompanyDashboardsList, type DashboardSummary } from '@/lib/companyDashboards';

export default function DashboardsListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useSession();
  const { data: dashboards, isLoading } = useCompanyDashboardsList(profile?.id ?? null, profile?.active_company_id ?? null);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      data={dashboards ?? []}
      keyExtractor={(d) => d.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }}>
          No dashboards yet. Build one in Custom tables & boards on the web dashboard.
        </Text>
      }
      renderItem={({ item }: { item: DashboardSummary }) => {
        const Icon = ((LucideIcons as unknown as Record<string, LucideIcon>)[item.icon] ?? LayoutDashboard) as LucideIcon;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/dashboards/[slug]', params: { slug: item.slug } } as never)}
            style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${item.color}20` }]}>
              <Icon size={18} color={item.color} />
            </View>
            <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
});
