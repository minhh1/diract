import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Sparkles, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';

type DraftEntry = {
  key: string;
  userId: string | null;
  userName: string | null;
  matterId: string | null;
  matterLabel: string | null;
  description: string;
  hours: number;
  date: string;
  sourceTaskIds: string[];
  sourceEmailIds: string[];
  sourceSegmentIds: string[];
};

type JobRow = {
  id: string;
  status: 'running' | 'done' | 'error';
  processed: number;
  total: number;
  entries: DraftEntry[];
  error: string | null;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Native port of components/dashboard/AutoTimeRecordingButtonWidget.tsx +
// AutoTimeRecordingPanel.tsx -- no business logic duplicated here at all,
// this just drives the same two API routes the web panel does
// (app/api/time-entries/auto-generate, .../submit), which already own
// every real step (drafting via AI, matching tasks/emails to matters,
// atomically claiming sources on submit). v1 gaps vs web: scope is always
// 'mine' (no admin "push everyone's day" toggle), no per-entry email/task
// source preview or timekeeper reassignment for an unattributed email
// (userId: null entries just can't be submitted here -- open on web for
// those), no "regenerate description" AI action. Polls the job row on an
// interval rather than a Realtime subscription -- simpler, and this drawer
// is only ever open for the seconds it takes one day's draft to generate.
export function AutoTimeRecordingButtonWidget({ label, companyId, userId }: { label: string; companyId: string; userId: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayYmd());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState<Record<string, true>>({});
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const generate = async () => {
    setError(null);
    setJob(null);
    setSubmitted({});
    setSubmitErrors({});
    setGenerating(true);
    try {
      const res = await callApi('/api/time-entries/auto-generate', {
        method: 'POST',
        body: JSON.stringify({ date, scope: 'mine', detailLevel: 'standard' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start generation');
      setJobId(json.jobId);

      stopPolling();
      pollRef.current = setInterval(async () => {
        const { data, error: fetchError } = await supabase
          .from('auto_time_entry_generation_jobs')
          .select('id, status, processed, total, entries, error')
          .eq('id', json.jobId)
          .maybeSingle();
        if (fetchError || !data) return;
        setJob(data as JobRow);
        if (data.status !== 'running') {
          stopPolling();
          setGenerating(false);
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start generation');
      setGenerating(false);
    }
  };

  const updateEntry = (key: string, patch: Partial<DraftEntry>) => {
    setJob((prev) => (prev ? { ...prev, entries: prev.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)) } : prev));
  };

  const submitEntry = async (entry: DraftEntry) => {
    setSubmitting((prev) => ({ ...prev, [entry.key]: true }));
    setSubmitErrors((prev) => { const { [entry.key]: _removed, ...rest } = prev; return rest; });
    try {
      const res = await callApi('/api/time-entries/submit', {
        method: 'POST',
        body: JSON.stringify({ entries: [entry] }),
      });
      const json = await res.json();
      const result = json.results?.[0];
      if (!res.ok || !result?.ok) {
        setSubmitErrors((prev) => ({ ...prev, [entry.key]: result?.error || json.error || 'Could not submit this entry' }));
        return;
      }
      setSubmitted((prev) => ({ ...prev, [entry.key]: true }));
    } catch {
      setSubmitErrors((prev) => ({ ...prev, [entry.key]: 'Could not submit this entry' }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [entry.key]: false }));
    }
  };

  const entries = job?.entries ?? [];

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.button, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Sparkles size={16} color={theme.text} />
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

          <View style={styles.controlsRow}>
            <Pressable onPress={() => setDatePickerOpen(true)} style={[styles.dateButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{new Date(`${date}T00:00:00`).toLocaleDateString('en-AU')}</Text>
            </Pressable>
            <Pressable onPress={generate} disabled={generating} style={[styles.generateButton, { backgroundColor: theme.accent, opacity: generating ? 0.6 : 1 }]}>
              {generating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Generate</Text>}
            </Pressable>
          </View>
          {datePickerOpen && (
            <DateTimePicker
              value={new Date(`${date}T00:00:00`)}
              mode="date"
              onChange={(_event, selected) => {
                setDatePickerOpen(false);
                if (selected) setDate(selected.toISOString().slice(0, 10));
              }}
            />
          )}

          {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}

          <ScrollView contentContainerStyle={styles.list}>
            {job?.status === 'running' && (
              <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
                Drafting entries from your tasks and emails{job.total ? ` (${job.processed}/${job.total})` : '...'}
              </Text>
            )}
            {job?.status === 'error' && <Text style={[styles.errorText, { color: theme.danger }]}>{job.error || 'Could not draft entries for this day'}</Text>}
            {job?.status === 'done' && entries.length === 0 && (
              <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12, fontStyle: 'italic' }}>Nothing new to draft for this day.</Text>
            )}
            {entries.map((entry) => {
              const isSubmitted = submitted[entry.key];
              return (
                <View key={entry.key} style={[styles.entryCard, { borderColor: theme.border, opacity: isSubmitted ? 0.5 : 1 }]}>
                  <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{entry.matterLabel || 'No matter'}</Text>
                  <TextInput
                    value={entry.description}
                    onChangeText={(text) => updateEntry(entry.key, { description: text })}
                    multiline
                    editable={!isSubmitted}
                    style={[styles.descriptionInput, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }]}
                  />
                  <View style={styles.entryFooterRow}>
                    <TextInput
                      value={String(entry.hours)}
                      onChangeText={(text) => updateEntry(entry.key, { hours: Number(text) || 0 })}
                      keyboardType="decimal-pad"
                      editable={!isSubmitted}
                      style={[styles.hoursInput, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }]}
                    />
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>hours</Text>
                    <View style={{ flex: 1 }} />
                    {isSubmitted ? (
                      <Text style={{ color: theme.success, fontSize: 12, fontWeight: '800' }}>Added</Text>
                    ) : !entry.userId || !entry.matterId ? (
                      <Text style={{ color: theme.textSecondary, fontSize: 10, fontStyle: 'italic' }}>Edit on web</Text>
                    ) : (
                      <Pressable
                        onPress={() => submitEntry(entry)}
                        disabled={!!submitting[entry.key]}
                        style={[styles.submitButton, { backgroundColor: theme.accent, opacity: submitting[entry.key] ? 0.6 : 1 }]}
                      >
                        {submitting[entry.key] ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Add</Text>}
                      </Pressable>
                    )}
                  </View>
                  {submitErrors[entry.key] && <Text style={[styles.errorText, { color: theme.danger }]}>{submitErrors[entry.key]}</Text>}
                </View>
              );
            })}
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
  controlsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  dateButton: { flex: 1, borderWidth: 1, borderRadius: Radii.pill, paddingVertical: 12, alignItems: 'center' },
  generateButton: { borderRadius: Radii.pill, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 12, fontWeight: '600', paddingHorizontal: 20, marginTop: 8 },
  list: { padding: 20, gap: 12 },
  entryCard: { borderWidth: 1, borderRadius: Radii.card, padding: 12, gap: 8 },
  descriptionInput: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 12, minHeight: 50, textAlignVertical: 'top' },
  entryFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, width: 56 },
  submitButton: { borderRadius: Radii.pill, paddingHorizontal: 14, paddingVertical: 7 },
});
