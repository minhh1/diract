import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ClipboardList, FileSignature, Files, Users2 } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePublicTaskPagesList } from '@/lib/publicTaskPages';
import { useDocumentFillPagesList } from '@/lib/documentFillPages';
import { useClientUpdatePagesList } from '@/lib/clientUpdatePages';
import { useCompanyPagesList } from '@/lib/companyPages';
import { IconBadge } from '@/components/ui/IconBadge';

// Lists every "shared page" (see the naming note in each lib file --
// public-tasks is really just scope-gated for signed-in company members;
// document-fill and client-update pages are genuinely anonymous/PIN-gated
// links, viewed here the same way components/dashboard/*Widget.tsx embed
// them for a logged-in staff member: same data, same APIs, no separate
// "admin" endpoint; company_pages ("Pages") is a fourth, unrelated feature
// -- AI-authored content pages whose content is identical for every
// viewer, fetched via the plain authenticated company_pages routes rather
// than any public/PIN-gated one, see companyPages.ts's own header
// comment). Four independent Supabase-backed features, not one underlying
// table, so four separate list queries.
export default function PublicPagesListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const taskPages = usePublicTaskPagesList();
  const documentPages = useDocumentFillPagesList();
  const updatePages = useClientUpdatePagesList();
  const companyPages = useCompanyPagesList();

  const isLoading = taskPages.isLoading || documentPages.isLoading || updatePages.isLoading || companyPages.isLoading;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const activeTaskPages = (taskPages.data ?? []).filter((p) => p.isActive);
  const hasAny = activeTaskPages.length > 0 || (documentPages.data ?? []).length > 0 || (updatePages.data ?? []).length > 0 || (companyPages.data ?? []).length > 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {!hasAny && <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No shared pages yet.</Text>}

      {activeTaskPages.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>TASK PAGES</Text>
          {activeTaskPages.map((page) => (
            <Pressable
              key={page.id}
              onPress={() => router.push({ pathname: '/more/public/tasks/[pageId]', params: { pageId: page.id } } as never)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.rowLeft}>
                <IconBadge index={0} size={38}>
                  <ClipboardList size={17} color="#fff" />
                </IconBadge>
                <View>
                  <Text style={[styles.rowLabel, { color: theme.text }]}>{page.title}</Text>
                  <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{page.teamName ?? page.scope.replace(/_/g, ' ')}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {(documentPages.data ?? []).length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DOCUMENT PAGES</Text>
          {(documentPages.data ?? []).map((page) => (
            <Pressable
              key={page.id}
              onPress={() => router.push({ pathname: '/more/public/documents/[pageId]', params: { pageId: page.id } } as never)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.rowLeft}>
                <IconBadge index={1} size={38}>
                  <FileSignature size={17} color="#fff" />
                </IconBadge>
                <View>
                  <Text style={[styles.rowLabel, { color: theme.text }]}>{page.title}</Text>
                  {!!(page.clientName || page.projectName) && (
                    <Text style={[styles.rowHint, { color: theme.textSecondary }]} numberOfLines={1}>
                      {page.clientName || page.projectName}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {(updatePages.data ?? []).length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CLIENT UPDATE PAGES</Text>
          {(updatePages.data ?? [])
            .filter((p) => p.is_active)
            .map((page) => (
              <Pressable
                key={page.id}
                onPress={() => router.push({ pathname: '/more/public/updates/[slug]', params: { slug: page.slug } } as never)}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}
              >
                <View style={styles.rowLeft}>
                  <IconBadge index={2} size={38}>
                    <Users2 size={17} color="#fff" />
                  </IconBadge>
                  <View>
                    <Text style={[styles.rowLabel, { color: theme.text }]}>{page.title}</Text>
                    <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{page.matterCount} matters</Text>
                  </View>
                </View>
              </Pressable>
            ))}
        </>
      )}

      {(companyPages.data ?? []).length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PAGES</Text>
          {(companyPages.data ?? []).map((page) => (
            <Pressable
              key={page.id}
              onPress={() => router.push({ pathname: '/more/public/pages/[id]', params: { id: page.id } } as never)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.rowLeft}>
                <IconBadge index={3} size={38}>
                  <Files size={17} color="#fff" />
                </IconBadge>
                <View>
                  <Text style={[styles.rowLabel, { color: theme.text }]}>{page.title}</Text>
                  <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{page.status === 'draft' ? 'Draft' : page.visibility}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, paddingRight: 16, borderRadius: Radii.badge },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  rowHint: { fontSize: 11, fontWeight: '500', marginTop: 1, textTransform: 'capitalize' },
});
