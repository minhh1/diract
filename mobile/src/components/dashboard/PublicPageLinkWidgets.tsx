import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckSquare, ChevronRight, FileSignature, Newspaper, Share2 } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Native counterparts to PublicTaskPageWidget.tsx/DocumentPublicPageWidget.tsx/
// ClientUpdatePageWidget.tsx on the web app -- those embed the full shared
// page INLINE on the dashboard; this app already has a dedicated native
// screen for each one (more/public/tasks|documents|updates), so tapping the
// card navigates there instead of re-embedding the same content a second
// way. Creating/picking a page (config.pageId/slug is null) is a config-panel,
// admin-only action not offered here -- same "open on web" fallback as
// DashboardWidgetRenderer.tsx already uses for anything else unbuilt.
function LinkCard({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {icon}
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, flex: 1 }}>{label}</Text>
      <ChevronRight size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

function EmptyCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.emptyCard, { borderColor: theme.border }]}>
      {icon}
      <Text style={{ color: theme.textSecondary, fontSize: 11, flex: 1 }}>{label}</Text>
    </View>
  );
}

export function PublicTaskPageLinkWidget({ pageId }: { pageId: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  if (!pageId) return <EmptyCard icon={<Share2 size={16} color={theme.textSecondary} />} label="Open this widget's settings on web to create the public link" />;
  return <LinkCard icon={<CheckSquare size={16} color={theme.accent} />} label="Open task page" onPress={() => router.push({ pathname: '/more/public/tasks/[pageId]', params: { pageId } } as never)} />;
}

export function PublicDocumentPageLinkWidget({ pageId }: { pageId: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  if (!pageId) return <EmptyCard icon={<FileSignature size={16} color={theme.textSecondary} />} label="Open this widget's settings on web to pick a document link" />;
  return <LinkCard icon={<FileSignature size={16} color={theme.accent} />} label="Open document page" onPress={() => router.push({ pathname: '/more/public/documents/[pageId]', params: { pageId } } as never)} />;
}

export function PublicClientUpdatePageLinkWidget({ slug }: { slug: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  if (!slug) return <EmptyCard icon={<Newspaper size={16} color={theme.textSecondary} />} label="Open this widget's settings on web to create or pick a client update page" />;
  return <LinkCard icon={<Newspaper size={16} color={theme.accent} />} label="Open client update page" onPress={() => router.push({ pathname: '/more/public/updates/[slug]', params: { slug } } as never)} />;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radii.card, padding: 14 },
  emptyCard: { borderStyle: 'dashed' },
});
