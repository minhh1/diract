import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bot,
  Building2,
  Clapperboard,
  CreditCard,
  FileEdit,
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
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { PushNotificationSettingsRow } from '@/components/PushNotificationSettingsRow';
import { VIRTUAL_COMPUTERS_ALLOWED_COMPANY_ID } from '@/lib/allowedCompany';

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, signOut } = useSession();
  const canUseVirtualComputers = profile?.active_company_id === VIRTUAL_COMPUTERS_ALLOWED_COMPANY_ID;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={[styles.profileCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Text style={[styles.name, { color: theme.text }]}>{profile?.full_name || profile?.email}</Text>
        <Text style={[styles.email, { color: theme.textSecondary }]}>{profile?.email}</Text>
      </View>

      <PushNotificationSettingsRow />

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>RECORDS</Text>
      <Pressable
        onPress={() => router.push('/more/properties')}
        style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      >
        <View style={styles.rowLeft}>
          <Building2 size={18} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Properties</Text>
        </View>
      </Pressable>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OPEN ON THE WEB</Text>
      <View style={{ gap: 8 }}>
        <OpenInBrowserRow label="AI assistant" path="/dashboard/ai" icon={Bot} />
        <OpenInBrowserRow label="Custom tables & boards" path="/dashboard/boards" icon={LayoutTemplate} />
        <OpenInBrowserRow label="Schema builder" path="/dashboard/schema" icon={Settings} />
        <OpenInBrowserRow label="Document templates" path="/dashboard/templates" icon={FileEdit} />
        <OpenInBrowserRow label="PDF editor" path="/dashboard/pdf-editor" icon={FileEdit} />
        <OpenInBrowserRow label="Outlook inbox" path="/dashboard/outlook" icon={Inbox} />
        <OpenInBrowserRow label="Gmail inbox" path="/dashboard/gmail" icon={MailCheck} />
        <OpenInBrowserRow label="Billing & invoicing" path="/dashboard/billing" icon={CreditCard} />
        {canUseVirtualComputers && (
          <OpenInBrowserRow label="Virtual computers" path="/dashboard/virtual-computers" icon={Monitor} />
        )}
        <OpenInBrowserRow label="Marketplace" path="/dashboard/marketplace" icon={Store} />
        <OpenInBrowserRow label="Admin" path="/dashboard/admin" icon={ShieldCheck} />
        <OpenInBrowserRow label="Company settings" path="/dashboard/settings" icon={Clapperboard} />
      </View>

      <Pressable style={[styles.signOutButton, { borderColor: theme.border }]} onPress={signOut}>
        <LogOut size={16} color={theme.danger} />
        <Text style={[styles.signOutText, { color: theme.danger }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  profileCard: { padding: 18, borderRadius: 20, borderWidth: 1, gap: 4 },
  name: { fontSize: 17, fontWeight: '800' },
  email: { fontSize: 13, fontWeight: '500' },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, borderWidth: 1 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  signOutButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  signOutText: { fontWeight: '700', fontSize: 13 },
});
