import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { callApi } from '@/lib/api';
import { HOSTED_MODELS } from '@/lib/aiModels';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Calls the same app/api/ai/chat/route.ts the web dashboard's AI assistant
// uses, via the Bearer-token path lib/supabaseServer.ts now supports. That
// route streams newline-delimited JSON; React Native's fetch streaming
// support is inconsistent enough across RN/Expo versions that this awaits
// the full response and replays it instead of rendering token-by-token --
// correct, just not (yet) a token-streaming UI. See mobile/README.md.
export default function AiAssistantScreen() {
  const theme = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [modelId, setModelId] = useState<string>(HOSTED_MODELS[0].id);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId] = useState(() => Crypto.randomUUID());

  const send = async () => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    setError(null);
    setQuestion('');
    const history = messages;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setSending(true);

    try {
      const res = await callApi('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed, modelId, provider: 'hosted', history, conversationId }),
      });
      const text = await res.text();
      if (!res.ok) {
        const parsed = JSON.parse(text || '{}');
        throw new Error(parsed.error || `Request failed (${res.status})`);
      }

      let content = '';
      let lineError: string | null = null;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (typeof event.delta === 'string') content += event.delta;
        if (event.error) lineError = event.error;
      }

      if (lineError) throw new Error(lineError);
      setMessages((prev) => [...prev, { role: 'assistant', content: content || '(no response)' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.modelRow, { borderColor: theme.border }]}>
        <FlatList
          horizontal
          data={HOSTED_MODELS}
          keyExtractor={(m) => m.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setModelId(item.id)}
              style={[styles.chip, { backgroundColor: modelId === item.id ? theme.accent : theme.backgroundSelected }]}
            >
              <Text style={{ color: modelId === item.id ? '#fff' : theme.text, fontWeight: '700', fontSize: 11 }}>{item.label}</Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>Ask about your matters, tasks, or leads.</Text>}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user'
                ? { backgroundColor: theme.accent, alignSelf: 'flex-end' }
                : { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1, alignSelf: 'flex-start' },
            ]}
          >
            <Text style={{ color: item.role === 'user' ? '#fff' : theme.text, fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
          </View>
        )}
      />

      {error && <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 8 }}>{error}</Text>}

      <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask the AI assistant"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          multiline
        />
        <Pressable onPress={send} disabled={sending || !question.trim()} style={{ opacity: sending || !question.trim() ? 0.5 : 1 }}>
          {sending ? <ActivityIndicator size="small" /> : <Send size={20} color={theme.accent} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  modelRow: { borderBottomWidth: 1, paddingVertical: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  bubble: { maxWidth: '85%', borderRadius: 16, padding: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1 },
  input: { flex: 1, fontSize: 14, maxHeight: 100, paddingVertical: 6 },
});
