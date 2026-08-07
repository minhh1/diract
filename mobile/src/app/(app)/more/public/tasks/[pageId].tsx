import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Bell, BellOff, Calendar, Check, Circle, Plus, Search, Trash2, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import { useSession } from '@/lib/session';
import { GradientButton } from '@/components/ui/GradientButton';
import {
  useAddFollowUp,
  useCreateTask,
  useDeleteTask,
  useMarkFollowUpDone,
  useRemoveFollowUp,
  useTaskPage,
  useToggleTaskComplete,
  useUpdateTask,
  type PublicTask,
  type TaskFormOptions,
} from '@/lib/publicTaskPages';

// Native port of components/public/PublicTasksContent.tsx. Covers the
// interactions most worth doing from a phone: complete/delete (as swipe
// actions, since a phone has no hover/right-click for a row menu), full
// edit (name/due/notes/team/assignee/monetary), follow-ups, watch/unwatch,
// and adding a task. Deliberately not ported: task dependencies and the
// "Next task" chained-add flow (both editing UI meant for triaging a long
// backlog at a desk), checklist-template bulk-apply, and per-user
// Organised-view group reassignment (Action/Follow up/Watching) -- real
// gaps, not overlooked, see mobile/README.md.
function formatDue(task: PublicTask): string | null {
  if (!task.dueDate) return null;
  const date = new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return task.dueTime ? `${date}, ${task.dueTime.slice(0, 5)}` : date;
}

function SimplePickerSheet({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string; sublabel?: string | null }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.pickerCard, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement, marginHorizontal: 16 }]}>
            <Search size={15} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
          <ScrollView
            style={{ marginTop: 10 }}
            contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 6 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {filtered.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => {
                  onSelect(opt.id);
                  onClose();
                }}
                style={[styles.pickerRow, { backgroundColor: theme.backgroundElement }]}
              >
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                  {opt.label}
                </Text>
                {!!opt.sublabel && <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{opt.sublabel}</Text>}
              </Pressable>
            ))}
            {filtered.length === 0 && <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>No matches.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TaskDetailModal({
  task,
  pageId,
  formOptions,
  onClose,
}: {
  task: PublicTask | null;
  pageId: string;
  formOptions: TaskFormOptions;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { profile } = useSession();
  const userId = profile?.id ?? null;
  const update = useUpdateTask(pageId);
  const del = useDeleteTask(pageId);
  const addFollowUp = useAddFollowUp(pageId);
  const removeFollowUp = useRemoveFollowUp(pageId);
  const markFollowUpDone = useMarkFollowUpDone(pageId);
  const [name, setName] = useState(task?.name ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [assigneePicker, setAssigneePicker] = useState(false);
  const [teamPicker, setTeamPicker] = useState(false);

  if (!task) return null;

  const commitName = () => {
    if (name.trim() && name !== task.name) update.mutate({ taskId: task.id, patch: { name: name.trim() } });
  };
  const commitNotes = () => {
    if (notes !== (task.notes ?? '')) update.mutate({ taskId: task.id, patch: { notes } });
  };

  const assigneeName = formOptions.assignees.find((a) => a.id === task.assigneeId)?.name;
  const teamName = formOptions.teams.find((t) => t.id === task.teamId)?.team_name ?? task.team;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.detailCard, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text, flex: 1 }]} numberOfLines={2}>
              Task details
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={commitName}
              onSubmitEditing={commitName}
              multiline
              style={[styles.nameInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />

            <Pressable
              onPress={() => update.mutate({ taskId: task.id, patch: { isCompleted: !task.isCompleted } })}
              style={[styles.completeRow, { backgroundColor: task.isCompleted ? theme.successBackground : theme.backgroundElement }]}
            >
              {task.isCompleted ? <Check size={16} color={theme.success} /> : <Circle size={16} color={theme.textSecondary} />}
              <Text style={{ color: task.isCompleted ? theme.success : theme.text, fontWeight: '700', fontSize: 13 }}>
                {task.isCompleted ? 'Completed' : 'Mark complete'}
              </Text>
            </Pressable>

            <Pressable onPress={() => setShowDatePicker(true)} style={[styles.fieldRow, { backgroundColor: theme.backgroundElement }]}>
              <Calendar size={15} color={theme.textSecondary} />
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{formatDue(task) ?? 'Set due date'}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : new Date()}
                mode="date"
                onChange={(_e, selected) => {
                  setShowDatePicker(false);
                  if (selected) update.mutate({ taskId: task.id, patch: { dueDate: selected.toISOString().slice(0, 10) } });
                }}
              />
            )}

            <Pressable onPress={() => setAssigneePicker(true)} style={[styles.fieldRow, { backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>Assignee</Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>{assigneeName ?? 'Unassigned'}</Text>
            </Pressable>
            <Pressable onPress={() => setTeamPicker(true)} style={[styles.fieldRow, { backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>Team</Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>{teamName ?? 'None'}</Text>
            </Pressable>

            {task.isMonetary && task.estimatedCost != null && (
              <View style={[styles.fieldRow, { backgroundColor: theme.backgroundElement }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>Estimated cost</Text>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>
                  {formatCurrency(task.estimatedCost)}
                </Text>
              </View>
            )}

            <Pressable
              onPress={() =>
                update.mutate({
                  taskId: task.id,
                  patch: { watcherIds: task.isWatcher ? task.watcherIds.filter((id) => id !== userId) : [...task.watcherIds, userId] },
                })
              }
              disabled={!userId}
              style={[styles.fieldRow, { backgroundColor: theme.backgroundElement }]}
            >
              {task.isWatcher ? <Bell size={15} color={theme.accent} /> : <BellOff size={15} color={theme.textSecondary} />}
              <Text style={{ color: task.isWatcher ? theme.accent : theme.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                {task.isWatcher ? 'Watching' : 'Not watching'}
              </Text>
            </Pressable>

            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>NOTES</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                onBlur={commitNotes}
                multiline
                placeholder="Add notes..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.notesInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>FOLLOW-UPS</Text>
              {task.followUps.map((f) => (
                <View key={f.id} style={[styles.followUpRow, { backgroundColor: theme.backgroundElement }]}>
                  <Pressable onPress={() => !f.isDone && markFollowUpDone.mutate({ taskId: task.id, followUpId: f.id })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {f.isDone ? <Check size={14} color={theme.success} /> : <Circle size={14} color={theme.textSecondary} />}
                    <Text style={{ color: theme.text, fontSize: 13, textDecorationLine: f.isDone ? 'line-through' : 'none' }}>
                      {new Date(f.followedUpAt).toLocaleDateString('en-AU')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => removeFollowUp.mutate({ taskId: task.id, followUpId: f.id })} hitSlop={8}>
                    <Trash2 size={14} color={theme.danger} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => addFollowUp.mutate({ taskId: task.id })}
                style={[styles.addFollowUpRow, { borderColor: theme.border }]}
              >
                <Plus size={14} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>Log a follow-up for today</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() =>
                Alert.alert('Delete task', "This cannot be undone.", [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { del.mutate(task.id); onClose(); } },
                ])
              }
              style={[styles.deleteButton, { backgroundColor: theme.dangerBackground }]}
            >
              <Trash2 size={15} color={theme.danger} />
              <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 13 }}>Delete task</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      <SimplePickerSheet
        visible={assigneePicker}
        title="Assignee"
        options={formOptions.assignees.map((a) => ({ id: a.id, label: a.name }))}
        onSelect={(id) => update.mutate({ taskId: task.id, patch: { assigneeId: id } })}
        onClose={() => setAssigneePicker(false)}
      />
      <SimplePickerSheet
        visible={teamPicker}
        title="Team"
        options={formOptions.teams.map((t) => ({ id: t.id, label: t.team_name }))}
        onSelect={(id) => update.mutate({ taskId: task.id, patch: { teamId: id } })}
        onClose={() => setTeamPicker(false)}
      />
    </Modal>
  );
}

function AddTaskModal({ visible, pageId, formOptions, onClose }: { visible: boolean; pageId: string; formOptions: TaskFormOptions; onClose: () => void }) {
  const theme = useTheme();
  const create = useCreateTask(pageId);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectPicker, setProjectPicker] = useState(false);

  const projectLabel = formOptions.projects.find((p) => p.id === projectId);

  const submit = async () => {
    if (!name.trim() || !projectId) return;
    await create.mutateAsync({ name: name.trim(), projectId });
    setName('');
    setProjectId(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.addTaskCard, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New task</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Task name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.nameInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />
            <Pressable onPress={() => setProjectPicker(true)} style={[styles.fieldRow, { backgroundColor: theme.backgroundElement, marginTop: 12 }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>Matter</Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={1}>
                {projectLabel?.name ?? 'Select a matter'}
              </Text>
            </Pressable>
            <GradientButton onPress={submit} loading={create.isPending} disabled={!name.trim() || !projectId} style={{ marginTop: 12 }}>
              Add task
            </GradientButton>
          </ScrollView>
        </View>
      </View>
      <SimplePickerSheet
        visible={projectPicker}
        title="Select a matter"
        options={formOptions.projects.map((p) => ({ id: p.id, label: p.name, sublabel: p.matterNumber }))}
        onSelect={setProjectId}
        onClose={() => setProjectPicker(false)}
      />
    </Modal>
  );
}

function TaskRow({ task, pageId, onPress }: { task: PublicTask; pageId: string; onPress: () => void }) {
  const theme = useTheme();
  const toggle = useToggleTaskComplete(pageId);
  const del = useDeleteTask(pageId);
  const due = formatDue(task);

  return (
    <ReanimatedSwipeable
      renderLeftActions={() => (
        <Pressable
          onPress={() => toggle.mutate({ taskId: task.id, isCompleted: !task.isCompleted })}
          style={[styles.swipeAction, { backgroundColor: theme.success }]}
        >
          {task.isCompleted ? <Circle size={20} color="#fff" /> : <Check size={20} color="#fff" />}
        </Pressable>
      )}
      renderRightActions={() => (
        <Pressable
          onPress={() =>
            Alert.alert('Delete task', "This cannot be undone.", [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => del.mutate(task.id) },
            ])
          }
          style={[styles.swipeAction, { backgroundColor: theme.danger }]}
        >
          <Trash2 size={20} color="#fff" />
        </Pressable>
      )}
    >
      <Pressable onPress={onPress} style={[styles.taskRow, { backgroundColor: theme.backgroundElement, opacity: task.isCompleted ? 0.6 : 1 }]}>
        {task.isCompleted ? (
          <View style={[styles.checkFilled, { backgroundColor: theme.success }]}>
            <Check size={13} color="#fff" />
          </View>
        ) : (
          <Circle size={22} color={theme.textSecondary} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskName, { color: theme.text, textDecorationLine: task.isCompleted ? 'line-through' : 'none' }]}>{task.name}</Text>
          <View style={styles.taskMetaRow}>
            {!!task.projectName && (
              <Text style={[styles.taskMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                {task.projectName}
              </Text>
            )}
            {!!due && <Text style={[styles.taskMeta, { color: task.isCompleted ? theme.textSecondary : theme.accent }]}>{due}</Text>}
            {task.isMonetary && task.estimatedCost != null && (
              <Text style={[styles.taskMeta, { color: theme.textSecondary }]}>{formatCurrency(task.estimatedCost)}</Text>
            )}
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default function TaskPageScreen() {
  const theme = useTheme();
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const { data, isLoading } = useTaskPage(pageId);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTask, setSelectedTask] = useState<PublicTask | null>(null);
  const [addingTask, setAddingTask] = useState(false);

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
  // Re-selects the live version of the open task after a mutation
  // refetches the page, instead of the modal holding a stale snapshot.
  const liveSelectedTask = selectedTask ? tasks.find((t) => t.id === selectedTask.id) ?? null : null;

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
          <TaskRow key={task.id} task={task} pageId={pageId} onPress={() => setSelectedTask(task)} />
        ))}
        {completed.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>COMPLETED</Text>
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} pageId={pageId} onPress={() => setSelectedTask(task)} />
            ))}
          </>
        )}
      </ScrollView>

      <Pressable onPress={() => setAddingTask(true)} style={[styles.fab, { backgroundColor: theme.accent }]}>
        <Plus size={24} color="#fff" />
      </Pressable>

      <TaskDetailModal key={liveSelectedTask?.id ?? 'none'} task={liveSelectedTask} pageId={pageId} formOptions={data.formOptions} onClose={() => setSelectedTask(null)} />
      <AddTaskModal visible={addingTask} pageId={pageId} formOptions={data.formOptions} onClose={() => setAddingTask(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill },
  list: { padding: 16, gap: 8, paddingBottom: 96 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 2 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: Radii.badge },
  checkFilled: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  taskName: { fontSize: 14, fontWeight: '700' },
  taskMetaRow: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  taskMeta: { fontSize: 11, fontWeight: '600' },
  swipeAction: { width: 64, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.badge, marginVertical: 2 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  pickerCard: { height: '80%', borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, overflow: 'hidden' },
  detailCard: { height: '90%', borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, overflow: 'hidden' },
  addTaskCard: { maxHeight: '80%', borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, overflow: 'hidden', paddingBottom: 24 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.pill },
  searchInput: { flex: 1, fontSize: 14 },
  pickerRow: { padding: 14, borderRadius: Radii.badge, gap: 2 },
  nameInput: { padding: 14, borderRadius: Radii.input, fontSize: 15, fontWeight: '700' },
  completeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: Radii.badge },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: Radii.badge },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  notesInput: { padding: 12, borderRadius: Radii.input, fontSize: 13, minHeight: 70, textAlignVertical: 'top' },
  followUpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: Radii.badge },
  addFollowUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radii.badge, borderWidth: 1, borderStyle: 'dashed' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: Radii.pill, marginTop: 4 },
});
