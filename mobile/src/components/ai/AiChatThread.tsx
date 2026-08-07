import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Brain, ChevronDown, ChevronRight, Send, Sparkles } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { sendChatMessage, fetchUsage, type ChatMessage, type ToolCallEvent, type Usage } from '@/lib/aiChat';
import { ToolCallChip } from './ToolCallChip';
import { SimpleMarkdown } from './SimpleMarkdown';

// Native port of components/ai/AiChatThread.tsx -- same job-based backend
// (app/api/ai/chat/route.ts), same Realtime-driven progress instead of a
// held-open stream (see that file's own header comment on why: Vercel's
// after() keeps the turn running even if this screen goes away mid-build).
// Tool-call confirmation is purely conversational on both platforms --
// the assistant asks in plain chat and waits for the next message, so
// there's no separate confirm UI to build here, just the ordinary send box.
// (Also skips the web version's onBuildProgress bookkeeping -- that exists
// there to live-refresh a widget-picker menu open in another pane, which
// has no mobile equivalent.)
const STALL_TIMEOUT_MS = 5 * 60 * 1000;

type AiChatJobRow = {
  id: string;
  content: string | null;
  reasoning: string | null;
  tool_calls: ToolCallEvent[] | null;
  status: 'running' | 'done' | 'error';
  error: string | null;
  hit_iteration_limit: boolean | null;
  updated_at: string | null;
};

export function AiChatThread({
  conversationId,
  initialMessages,
  onTurnComplete,
}: {
  conversationId: string;
  initialMessages: ChatMessage[];
  onTurnComplete?: () => void;
}) {
  const theme = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const jobUpdatedAtRef = useRef<number>(0);

  useEffect(() => {
    fetchUsage()
      .then(setUsage)
      .catch(() => {});
  }, []);

  const capReached = usage ? usage.tokensUsed >= usage.tokenCap : false;

  const applyJobRow = useCallback(
    (row: AiChatJobRow) => {
      jobUpdatedAtRef.current = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
      const toolCalls: ToolCallEvent[] = row.tool_calls ?? [];

      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content: row.content ?? '', toolCalls, reasoning: row.reasoning || undefined };
        return next;
      });

      if (row.status === 'error') {
        setError(row.error || 'Something went wrong');
      } else if (row.status === 'done' && row.hit_iteration_limit) {
        setError("This is taking more steps than I can do in one go -- ask me to continue and I'll pick up from here.");
      }

      if (row.status !== 'running') {
        setActiveJobId(null);
        setSending(false);
        fetchUsage()
          .then(setUsage)
          .catch(() => {});
        onTurnComplete?.();
      }
    },
    [onTurnComplete],
  );

  // Live progress for the job this screen is currently attached to.
  useEffect(() => {
    if (!activeJobId) return;
    const channel = supabase
      .channel(`ai-chat-job:${activeJobId}`)
      .on<AiChatJobRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_chat_jobs', filter: `id=eq.${activeJobId}` }, (payload) => applyJobRow(payload.new))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeJobId, applyJobRow]);

  // On open, resume a job that's still running for this conversation (left
  // going when the app was last backgrounded/closed mid-turn) instead of
  // showing a stale/incomplete thread.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('ai_chat_jobs')
      .select('id, content, reasoning, tool_calls, status, error, hit_iteration_limit, updated_at')
      .eq('conversation_id', conversationId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        jobUpdatedAtRef.current = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content ?? '', toolCalls: data.tool_calls ?? [], reasoning: data.reasoning || undefined }]);
        setSending(true);
        setActiveJobId(data.id);
      });
    return () => {
      cancelled = true;
    };
    // Mount-only, same reasoning as the web app's own identical effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sending || !activeJobId) return;
    const interval = setInterval(() => {
      if (Date.now() - jobUpdatedAtRef.current > STALL_TIMEOUT_MS) {
        setError('This is taking much longer than expected and may have stalled -- please try again.');
        setActiveJobId(null);
        setSending(false);
        onTurnComplete?.();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [sending, activeJobId, onTurnComplete]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || sending || capReached) return;

    setError(null);
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
    setSending(true);

    try {
      const { jobId } = await sendChatMessage(question, history, conversationId);
      jobUpdatedAtRef.current = Date.now();
      setActiveJobId(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSending(false);
      onTurnComplete?.();
    }
  }, [input, sending, capReached, messages, conversationId, onTurnComplete]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>Describe your business to get started.</Text>
        )}
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const hasToolCalls = (m.toolCalls?.length ?? 0) > 0;
          const showThinking = m.role === 'assistant' && !m.content && sending && isLast && !hasToolCalls && !m.reasoning;
          if (m.role === 'assistant' && !m.content && !hasToolCalls && !m.reasoning && !sending) return null;

          if (m.role === 'user') {
            return (
              <View key={i} style={styles.userRow}>
                <View style={[styles.userBubble, { backgroundColor: theme.backgroundSelected }]}>
                  <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{m.content}</Text>
                </View>
              </View>
            );
          }

          const thinkingExpanded = expandedThinking[i] ?? (isLast && sending && !m.content);

          return (
            <View key={i} style={styles.assistantRow}>
              {!!m.reasoning && (
                <View style={styles.thinkingBlock}>
                  <Pressable onPress={() => setExpandedThinking((prev) => ({ ...prev, [i]: !thinkingExpanded }))} style={styles.thinkingToggle}>
                    {thinkingExpanded ? <ChevronDown size={13} color={theme.textSecondary} /> : <ChevronRight size={13} color={theme.textSecondary} />}
                    <Brain size={13} color={theme.textSecondary} />
                    <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{thinkingExpanded ? 'Hide thinking' : 'Show thinking'}</Text>
                  </Pressable>
                  {thinkingExpanded && (
                    <View style={[styles.thinkingText, { borderColor: theme.border }]}>
                      <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>{m.reasoning}</Text>
                    </View>
                  )}
                </View>
              )}

              {hasToolCalls && (
                <View style={styles.toolCalls}>
                  {m.toolCalls!.map((call, ci) => (
                    <ToolCallChip key={ci} call={call} />
                  ))}
                </View>
              )}

              {showThinking ? (
                <View style={styles.thinkingIndicator}>
                  <Sparkles size={14} color={theme.textSecondary} />
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Thinking</Text>
                </View>
              ) : m.content ? (
                <SimpleMarkdown text={m.content} />
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.inputArea, { borderColor: theme.border }]}>
        {error && (
          <View style={styles.errorRow}>
            <AlertTriangle size={13} color={theme.danger} />
            <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600', flex: 1 }}>{error}</Text>
          </View>
        )}
        {capReached && (
          <View style={[styles.capBanner, { backgroundColor: theme.backgroundSelected }]}>
            <AlertTriangle size={13} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 }}>
              Monthly token cap reached, ask a company admin to raise it in Admin, AI Assistant.
            </Text>
          </View>
        )}
        <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Describe your business..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            multiline
            editable={!capReached}
          />
          <Pressable onPress={send} disabled={sending || capReached || !input.trim()} style={{ opacity: sending || capReached || !input.trim() ? 0.4 : 1 }}>
            {sending ? <ActivityIndicator size="small" color={theme.accent} /> : <Send size={20} color={theme.accent} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, gap: 14 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  assistantRow: { alignItems: 'flex-start' },
  thinkingBlock: { marginBottom: 8, width: '100%' },
  thinkingToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thinkingText: { marginTop: 6, paddingLeft: 12, borderLeftWidth: 2 },
  toolCalls: { gap: 6, marginBottom: 8, width: '100%' },
  thinkingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  inputArea: { borderTopWidth: 1, padding: 12, gap: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  capBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 10, borderRadius: 20, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, maxHeight: 120, paddingVertical: 6 },
});
