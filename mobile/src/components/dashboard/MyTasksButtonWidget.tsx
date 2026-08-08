import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Check, ListChecks, Trash2, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useRelationLabel } from '@/lib/relationLabels';

type TaskRow = {
  id: string;
  name: string;
  notes: string | null;
  due_date: string | null;
  project_id: string | null;
};

function TaskCard({
  task, draft, onDraftChange, onConvert, canConvert, onToggleComplete, onDelete, onDueDateChange,
}: {
  task: TaskRow;
  draft: string;
  onDraftChange: (v: string) => void;
  onConvert: () => void;
  canConvert: boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
  onDueDateChange: (v: string | null) => void;
}) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const matterLabel = useRelationLabel('projects', 'name', task.project_id);

  return (
    <View style={[styles.taskCard, { borderColor: theme.border }]}>
      <View style={styles.taskHeaderRow}>
        <Pressable onPress={onToggleComplete} hitSlop={6} style={[styles.completeCircle, { borderColor: theme.border }]}>
          <Check size={11} color={theme.textSecondary} />
        </Pressable>
        <Text style={[styles.taskName, { color: theme.text }]}>{task.name}</Text>
        <Pressable onPress={onDelete} hitSlop={6}>
          <Trash2 size={14} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Pressable onPress={() => setPickerOpen(true)} style={styles.dueDateRow}>
        <CalendarDays size={12} color={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
          {task.due_date ? new Date(task.due_date).toLocaleDateString('en-AU') : 'Set due date'}
        </Text>
      </Pressable>
      {pickerOpen && (
        <DateTimePicker
          value={task.due_date ? new Date(task.due_date) : new Date()}
          mode="date"
          onChange={(_event, selected) => {
            setPickerOpen(false);
            if (selected) onDueDateChange(selected.toISOString());
          }}
        />
      )}
      {task.project_id && matterLabel.data && (
        <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600' }}>Matter: {matterLabel.data}</Text>
      )}
      <TextInput
        value={draft}
        onChangeText={onDraftChange}
        multiline
        numberOfLines={2}
        style={[styles.draftInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
      />
      <Pressable
        onPress={onConvert}
        disabled={!canConvert}
        style={[styles.convertButton, { backgroundColor: theme.accent, opacity: canConvert ? 1 : 0.4 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Convert</Text>
      </Pressable>
    </View>
  );
}

// Native port of components/dashboard/MyTasksButtonWidget.tsx -- a drawer
// of the signed-in viewer's own open tasks (tasks.assignee_id = userId),
// each convertible into a prefilled draft on this dashboard's quick-add
// form (via onConvert, wired to [slug].tsx's quickAddPrefill state exactly
// like the web version's onQuickAddPrefill). v1 gap vs web: no "Rewrite
// with AI" button (app/api/ai/rewrite-text) -- the draft is still fully
// editable by hand before converting, just without the AI assist.
export function MyTasksButtonWidget({
  label,
  companyId,
  userId,
  descriptionFieldKey,
  matterFieldKey,
  onConvert,
}: {
  label: string;
  companyId: string;
  userId: string;
  descriptionFieldKey: string | null;
  matterFieldKey: string | null;
  onConvert: (values: Record<string, unknown>) => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const tasksQuery = useQuery({
    queryKey: ['my-open-tasks', companyId, userId],
    enabled: open,
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, name, notes, due_date, project_id')
        .eq('company_id', companyId)
        .eq('assignee_id', userId)
        .eq('is_completed', false)
        .is('deleted_at', null)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      const rows = data ?? [];
      setDrafts((prev) => {
        const next = { ...prev };
        for (const t of rows) if (next[t.id] === undefined) next[t.id] = t.notes || t.name;
        return next;
      });
      return rows;
    },
  });

  const tasks = tasksQuery.data ?? [];

  const toggleComplete = async (task: TaskRow) => {
    queryClient.setQueryData(['my-open-tasks', companyId, userId], (prev: TaskRow[] | undefined) => (prev ?? []).filter((t) => t.id !== task.id));
    const { error } = await supabase.from('tasks').update({ is_completed: true, completed_at: new Date().toISOString() }).eq('id', task.id);
    if (error) queryClient.invalidateQueries({ queryKey: ['my-open-tasks', companyId, userId] });
  };

  const deleteTask = (task: TaskRow) => {
    Alert.alert('Delete task', `Delete "${task.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          queryClient.setQueryData(['my-open-tasks', companyId, userId], (prev: TaskRow[] | undefined) => (prev ?? []).filter((t) => t.id !== task.id));
          const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
          if (error) queryClient.invalidateQueries({ queryKey: ['my-open-tasks', companyId, userId] });
        },
      },
    ]);
  };

  const changeDueDate = async (task: TaskRow, value: string | null) => {
    queryClient.setQueryData(['my-open-tasks', companyId, userId], (prev: TaskRow[] | undefined) => (prev ?? []).map((t) => (t.id === task.id ? { ...t, due_date: value } : t)));
    await supabase.from('tasks').update({ due_date: value }).eq('id', task.id);
  };

  const handleConvert = (task: TaskRow) => {
    if (!descriptionFieldKey) return;
    const values: Record<string, unknown> = { [descriptionFieldKey]: drafts[task.id] ?? task.notes ?? task.name };
    if (matterFieldKey && task.project_id) values[matterFieldKey] = task.project_id;
    onConvert(values);
    // Deliberately not closing the sheet or removing the task -- matches
    // web: converting logs time against a task without finishing it, and
    // the viewer may want to convert several tasks in a row.
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.button, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ListChecks size={16} color={theme.text} />
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{label}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.sheetHeader, { borderColor: theme.border }]}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <X size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {!descriptionFieldKey && (
            <View style={[styles.warningBanner, { backgroundColor: theme.backgroundSelected }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                This widget needs a description field configured on web before tasks can be converted.
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.list}>
            {tasksQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 24 }} />
            ) : tasks.length === 0 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 24, fontStyle: 'italic' }}>No open tasks assigned to you</Text>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  draft={drafts[task.id] ?? ''}
                  onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [task.id]: v }))}
                  onConvert={() => handleConvert(task)}
                  canConvert={!!descriptionFieldKey}
                  onToggleComplete={() => toggleComplete(task)}
                  onDelete={() => deleteTask(task)}
                  onDueDateChange={(v) => changeDueDate(task, v)}
                />
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: Radii.card, paddingVertical: 16 },
  sheet: { flex: 1, paddingTop: 60 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 15, fontWeight: '800' },
  warningBanner: { marginHorizontal: 20, marginTop: 12, padding: 12, borderRadius: 12 },
  list: { padding: 20, gap: 12 },
  taskCard: { borderWidth: 1, borderRadius: Radii.card, padding: 12, gap: 8 },
  taskHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  completeCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskName: { flex: 1, fontSize: 13, fontWeight: '700' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 28 },
  draftInput: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 12, minHeight: 50, textAlignVertical: 'top' },
  convertButton: { borderRadius: Radii.pill, paddingVertical: 8, alignItems: 'center' },
});
