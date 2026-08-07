import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Check, Circle } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTaskPage, useToggleTaskComplete, type PublicTask } from '@/lib/publicTaskPages';

function formatDue(task: PublicTask): string | null {
  if (!task.dueDate) return null;
  const date = new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return task.dueTime ? `${date}, ${task.dueTime.slice(0, 5)}` : date;
}

function TaskRow({ task, pageId }: { task: PublicTask; pageId: string }) {
  const theme = useTheme();
  const toggle = useToggleTaskComplete(pageId);
  const due = formatDue(task);

  return (
    <Pressable
      onPress={() => toggle.mutate({ taskId: task.id, isCompleted: !task.isCompleted })}
      disabled={toggle.isPending}
      style={[styles.taskRow, { backgroundColor: theme.backgroundElement, opacity: task.isCompleted ? 0.6 : 1 }]}
    >
      {task.isCompleted ? (
        <View style={[styles.checkFilled, { backgroundColor: theme.success }]}>
          <Check size={13} color="#fff" />
        </View>
      ) : (
        <Circle size={22} color={theme.textSecondary} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskName, { color: theme.text, textDecorationLine: task.isCompleted ? 'line-through' : 'none' }]} numberOfLines={2}>
          {task.name}
        </Text>
        <View style={styles.taskMetaRow}>
          {!!task.projectName && (
            <Text style={[styles.taskMeta, { color: theme.textSecondary }]} numberOfLines={1}>
              {task.projectName}
            </Text>
          )}
          {!!due && <Text style={[styles.taskMeta, { color: task.isCompleted ? theme.textSecondary : theme.accent }]}>{due}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

export default function TaskPageScreen() {
  const theme = useTheme();
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const { data, isLoading } = useTaskPage(pageId);
  const [activeTab, setActiveTab] = useState(0);

  if (isLoading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const tab = data.tabs[activeTab];
  const tasks = tab?.tasks ?? [];
  const active = tasks.filter((t) => !t.isCompleted);
  const completed = tasks.filter((t) => t.isCompleted);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {data.tabs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {data.tabs.map((t, i) => (
            <Pressable
              key={t.userId}
              onPress={() => setActiveTab(i)}
              style={[styles.tab, { backgroundColor: i === activeTab ? theme.accent : theme.backgroundSelected }]}
            >
              <Text style={{ color: i === activeTab ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>{t.userName}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <ScrollView contentContainerStyle={styles.list}>
        {active.length === 0 && completed.length === 0 && (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No tasks.</Text>
        )}
        {active.map((task) => (
          <TaskRow key={task.id} task={task} pageId={pageId} />
        ))}
        {completed.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>COMPLETED</Text>
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} pageId={pageId} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill },
  list: { padding: 16, gap: 8, paddingBottom: 48 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 2 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: Radii.badge },
  checkFilled: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  taskName: { fontSize: 14, fontWeight: '700' },
  taskMetaRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  taskMeta: { fontSize: 11, fontWeight: '600' },
});
