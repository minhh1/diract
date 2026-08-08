import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Share2 } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePublicTaskPagesList } from '@/lib/publicTaskPages';
import { TaskPageContent } from '@/components/tasks/TaskPageContent';

// The internal Tasks tab shows the same native Task Page experience as
// the Shared Pages destination (more/public/tasks/[pageId].tsx) instead
// of the generic raw-table RecordListView/RecordDetailView this used to
// fall back to -- that showed every column on the `tasks` system table
// verbatim (raw ids, a JSON column rendered as "[object Object]", etc.),
// none of it meant for a human to read directly. Reuses whichever of the
// company's own public_task_pages rows is scoped to 'company' -- that's
// the one an admin set up to mean "the whole company's tasks," the same
// semantic the "My Tasks" dashboard widget already relies on for
// 'my_and_unassigned'. If no company-scoped page exists yet, this asks
// for one to be created on web (the same "config stays on web, viewing is
// native" split every other admin-only setup step in this app already
// uses) rather than falling back to the raw table -- that fallback is
// exactly what produced the messy view this replaces.
export default function TasksScreen() {
  const theme = useTheme();
  const { data: pages, isLoading } = usePublicTaskPagesList();
  const companyPage = useMemo(() => pages?.find((p) => p.scope === 'company' && p.isActive) ?? null, [pages]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!companyPage) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Share2 size={22} color={theme.textSecondary} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, textAlign: 'center' }}>No company task page yet</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center' }}>
          Ask an admin to create a company-wide shared task page on web (Settings → Pages) to see everyone's tasks here.
        </Text>
      </View>
    );
  }

  return <TaskPageContent pageId={companyPage.id} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
});
