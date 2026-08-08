import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, type LucideIcon } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openOnWeb } from '@/lib/webHandoff';
import { IconBadge } from '@/components/ui/IconBadge';

// A handful of Diract features (the low-code schema/dashboard builder, the
// PDF editor, virtual-computer provisioning, billing, site-wide admin
// tools) are either desktop-oriented editing surfaces or not yet ported
// natively. Rather than a native screen that's a worse copy of the real
// thing, these open the already-responsive web dashboard in an in-app
// browser -- openOnWeb (lib/webHandoff.ts) hands the browser off already
// signed in when it can, falling back to a plain link (requiring a one-time
// web login) if that fails. (The AI assistant used to be in this list too
// -- see src/app/(app)/more/ai/ and its own README section for why it's a
// native screen now.)
export function OpenInBrowserRow({ label, path, icon: Icon, index = 0 }: { label: string; path: string; icon: LucideIcon; index?: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => openOnWeb(path)}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}
    >
      <View style={styles.left}>
        <IconBadge index={index} size={38}>
          <Icon size={17} color="#fff" />
        </IconBadge>
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
    padding: 10,
    paddingRight: 16,
    borderRadius: Radii.badge,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
});
