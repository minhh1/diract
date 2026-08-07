import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, FlaskConical } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Radii } from '@/constants/theme';
import { useGradients, useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useCompanyMemberships, switchActiveCompany, type CompanyMembership } from '@/lib/companies';

// Mirrors components/Sidebar.tsx's handleSwitchCompany on the web app: just
// updates profiles.active_company_id and refreshes -- every screen's data
// queries already key on profile.active_company_id (see src/lib/records.ts),
// so React Query naturally refetches under the new company once the profile
// updates. No manual cache-wipe needed, same reasoning as the web app's own
// comment on this (a company already visited this session stays cached).
export default function SwitchCompanyScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, refreshProfile } = useSession();
  const { data: memberships, isLoading } = useCompanyMemberships(profile?.id ?? null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSwitch = async (companyId: string) => {
    if (!profile || companyId === profile.active_company_id || switchingTo) return;
    setError(null);
    setSwitchingTo(companyId);
    try {
      await switchActiveCompany(profile.id, companyId);
      await refreshProfile();
      queryClient.invalidateQueries();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch companies.');
    } finally {
      setSwitchingTo(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={memberships ?? []}
          keyExtractor={(m) => m.company_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No companies found.</Text>}
          renderItem={({ item }: { item: CompanyMembership }) => {
            const isActive = item.company_id === profile?.active_company_id;
            return (
              <Pressable
                onPress={() => onSwitch(item.company_id)}
                disabled={isActive || !!switchingTo}
                style={[styles.row, { backgroundColor: theme.backgroundElement, opacity: switchingTo && !isActive ? 0.5 : 1 }]}
              >
                <View style={styles.rowLeft}>
                  {isActive ? (
                    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                      <Text style={styles.avatarTextActive}>{item.company?.name?.substring(0, 2)?.toUpperCase() || '??'}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
                      <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800' }}>
                        {item.company?.name?.substring(0, 2)?.toUpperCase() || '??'}
                      </Text>
                    </View>
                  )}
                  <View>
                    <View style={styles.nameRow}>
                      {item.company?.company_type === 'trial_sandbox' && <FlaskConical size={12} color={theme.textSecondary} />}
                      <Text style={[styles.name, { color: theme.text }]}>{item.company?.name || 'Unknown'}</Text>
                    </View>
                    <Text style={[styles.role, { color: theme.textSecondary }]}>{item.role}</Text>
                  </View>
                </View>
                {switchingTo === item.company_id ? (
                  <ActivityIndicator size="small" />
                ) : (
                  isActive && <Check size={18} color={theme.accent} />
                )}
              </Pressable>
            );
          }}
        />
      )}
      {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600', paddingHorizontal: 16, paddingTop: 8 }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: Radii.badge },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarTextActive: { color: '#fff', fontSize: 11, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700' },
  role: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
});
