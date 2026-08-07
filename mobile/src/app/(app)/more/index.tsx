import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bot,
  Building2,
  ChevronRight,
  Clapperboard,
  CreditCard,
  FileEdit,
  Home,
  Inbox,
  LayoutTemplate,
  LogOut,
  MailCheck,
  Monitor,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react-native';

import { OpenInBrowserRow } from '@/components/OpenInBrowserRow';
import { Radii } from '@/constants/theme';
import { useGradients, useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useCompanyMemberships } from '@/lib/companies';
import { PushNotificationSettingsRow } from '@/components/PushNotificationSettingsRow';
import { VIRTUAL_COMPUTERS_ALLOWED_COMPANY_ID } from '@/lib/allowedCompany';
import { IconBadge } from '@/components/ui/IconBadge';
import { HeroBackground } from '@/components/ui/HeroBackground';

export default function MoreScreen() {
  const theme = useTheme();
  const gradients = useGradients();
  const router = useRouter();
  const { profile, signOut } = useSession();
  const { data: memberships } = useCompanyMemberships(profile?.id ?? null);
  const canUseVirtualComputers = profile?.active_company_id === VIRTUAL_COMPUTERS_ALLOWED_COMPANY_ID;
  const activeCompanyName = memberships?.find((m) => m.company_id === profile?.active_company_id)?.company?.name;
  const initial = (profile?.full_name || profile?.email || '?').charAt(0).toUpperCase();

  return (
    <HeroBackground height={220}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.profileCard, { backgroundColor: theme.backgroundElement }]}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]}>{profile?.full_name || profile?.email}</Text>
            <Text style={[styles.email, { color: theme.textSecondary }]}>{profile?.email}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/more/switch-company' as never)}
          style={[styles.row, { backgroundColor: theme.backgroundElement }]}
        >
          <View style={styles.rowLeft}>
            <IconBadge index={0} size={38}>
              <Building2 size={17} color="#fff" />
            </IconBadge>
            <View>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{activeCompanyName || 'Switch company'}</Text>
              {!!activeCompanyName && (memberships?.length ?? 0) > 1 && (
                <Text style={[styles.companyHint, { color: theme.textSecondary }]}>Tap to switch company</Text>
              )}
            </View>
          </View>
          <ChevronRight size={18} color={theme.textSecondary} />
        </Pressable>

        <PushNotificationSettingsRow />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>RECORDS</Text>
        <Pressable
          onPress={() => router.push('/more/properties')}
          style={[styles.row, { backgroundColor: theme.backgroundElement }]}
        >
          <View style={styles.rowLeft}>
            <IconBadge index={1} size={38}>
              <Home size={17} color="#fff" />
            </IconBadge>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Properties</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push('/more/ai' as never)}
          style={[styles.row, { backgroundColor: theme.backgroundElement }]}
        >
          <View style={styles.rowLeft}>
            <IconBadge index={2} size={38}>
              <Bot size={17} color="#fff" />
            </IconBadge>
            <Text style={[styles.rowLabel, { color: theme.text }]}>AI assistant</Text>
          </View>
        </Pressable>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OPEN ON THE WEB</Text>
        <View style={{ gap: 8 }}>
          <OpenInBrowserRow index={0} label="Custom tables & boards" path="/dashboard/boards" icon={LayoutTemplate} />
          <OpenInBrowserRow index={1} label="Schema builder" path="/dashboard/schema" icon={Settings} />
          <OpenInBrowserRow index={2} label="Document templates" path="/dashboard/templates" icon={FileEdit} />
          <OpenInBrowserRow index={3} label="PDF editor" path="/dashboard/pdf-editor" icon={FileEdit} />
          <OpenInBrowserRow index={4} label="Outlook inbox" path="/dashboard/outlook" icon={Inbox} />
          <OpenInBrowserRow index={5} label="Gmail inbox" path="/dashboard/gmail" icon={MailCheck} />
          <OpenInBrowserRow index={6} label="Billing & invoicing" path="/dashboard/billing" icon={CreditCard} />
          {canUseVirtualComputers && (
            <OpenInBrowserRow index={7} label="Virtual computers" path="/dashboard/virtual-computers" icon={Monitor} />
          )}
          <OpenInBrowserRow index={0} label="Marketplace" path="/dashboard/marketplace" icon={Store} />
          <OpenInBrowserRow index={1} label="Admin" path="/dashboard/admin" icon={ShieldCheck} />
          <OpenInBrowserRow index={2} label="Company settings" path="/dashboard/settings" icon={Clapperboard} />
        </View>

        <Pressable style={[styles.signOutButton, { backgroundColor: theme.dangerBackground }]} onPress={signOut}>
          <LogOut size={16} color={theme.danger} />
          <Text style={[styles.signOutText, { color: theme.danger }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </HeroBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  profileCard: { padding: 16, borderRadius: Radii.card, gap: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '800' },
  email: { fontSize: 13, fontWeight: '500' },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, paddingRight: 16, borderRadius: Radii.badge },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  companyHint: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  signOutButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: Radii.pill,
    marginTop: 8,
  },
  signOutText: { fontWeight: '700', fontSize: 13 },
});
