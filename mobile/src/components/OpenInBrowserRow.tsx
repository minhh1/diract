import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, type LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { APP_URL } from '@/lib/config';

// A handful of Diract features (the low-code schema/dashboard builder, the
// PDF editor, virtual-computer provisioning, billing, site-wide admin
// tools) are either desktop-oriented editing surfaces or not yet ported
// natively. Rather than a native screen that's a worse copy of the real
// thing, these open the already-responsive web dashboard in an in-app
// browser, authenticated via the same Supabase session cookie once the
// user signs in there once. (The AI assistant used to be in this list too
// -- see src/app/(app)/more/ai/ and its own README section for why it's a
// native screen now.)
export function OpenInBrowserRow({ label, path, icon: Icon }: { label: string; path: string; icon: LucideIcon }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}${path}`)}
      style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
    >
      <View style={styles.left}>
        <Icon size={18} color={theme.textSecondary} />
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      </View>
      <ExternalLink size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 14, fontWeight: '600' },
});
