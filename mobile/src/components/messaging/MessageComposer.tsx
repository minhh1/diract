import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendMessage, type CompanyMember, type ChannelListItem } from '@/lib/messaging';

// Native port of components/messaging/MessageComposer.tsx. Same behavior:
// plain readable text while typing ("@John Smith"), only autocomplete-
// picked names become real @[Name](uuid)/#[name](uuid) tokens at send time
// (typing a name by hand without picking from the dropdown sends as plain
// text, matching Slack). RN's TextInput has no selectionStart on the
// change event itself, so cursor position is tracked separately via
// onSelectionChange.
interface PendingMention {
  token: string;
  label: string;
  id: string;
  kind: 'user' | 'channel';
}

interface AutocompleteState {
  kind: 'user' | 'channel';
  query: string;
  triggerIndex: number;
}

interface Props {
  channelId: string;
  companyId: string;
  userId: string;
  parentMessageId?: string | null;
  members: CompanyMember[];
  channels: ChannelListItem[];
  placeholder?: string;
  onSent?: () => void;
}

function memberLabel(m: CompanyMember): string {
  return m.full_name || m.email || 'Unknown';
}

export function MessageComposer({ channelId, companyId, userId, parentMessageId, members, channels, placeholder, onSent }: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const [sending, setSending] = useState(false);
  // Forces the caret to land right after a just-inserted token -- RN's
  // TextInput otherwise leaves it wherever it was (often 0) when `value`
  // changes programmatically, same underlying gap as web's composer needing
  // an explicit setSelectionRange after picking from the dropdown. Cleared
  // on the next real edit so it doesn't pin the cursor after that.
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  const namedChannels = channels.filter((c) => c.type === 'channel' && c.name);

  const autocompleteResults = (() => {
    if (!autocomplete) return [];
    const q = autocomplete.query.toLowerCase();
    if (autocomplete.kind === 'user') {
      return members.filter((m) => memberLabel(m).toLowerCase().includes(q)).slice(0, 6).map((m) => ({ id: m.id, label: memberLabel(m) }));
    }
    return namedChannels.filter((c) => (c.name || '').toLowerCase().includes(q)).slice(0, 6).map((c) => ({ id: c.id, label: c.name! }));
  })();

  const recomputeAutocomplete = (value: string, cursorPos: number) => {
    const uptoCursor = value.slice(0, cursorPos);
    const atMatch = uptoCursor.match(/(?:^|\s)@([^\s@#]*)$/);
    const hashMatch = uptoCursor.match(/(?:^|\s)#([^\s@#]*)$/);
    if (atMatch) {
      setAutocomplete({ kind: 'user', query: atMatch[1], triggerIndex: cursorPos - atMatch[1].length - 1 });
    } else if (hashMatch) {
      setAutocomplete({ kind: 'channel', query: hashMatch[1], triggerIndex: cursorPos - hashMatch[1].length - 1 });
    } else {
      setAutocomplete(null);
    }
  };

  const handleChangeText = (value: string) => {
    setText(value);
    setForcedSelection(undefined);
    // onChangeText fires before the selection-change event lands for this
    // same edit, so the cursor is approximated as "end of the new text"
    // here -- correct for normal typing (the common case), refined a beat
    // later by onSelectionChange for anything else (paste, cursor drag).
    const approxCursor = cursor + (value.length - text.length);
    recomputeAutocomplete(value, approxCursor);
  };

  const handleSelectionChange = (e: { nativeEvent: { selection: { start: number; end: number } } }) => {
    const pos = e.nativeEvent.selection.start;
    setCursor(pos);
    recomputeAutocomplete(text, pos);
  };

  const selectAutocomplete = (item: { id: string; label: string }) => {
    if (!autocomplete) return;
    const before = text.slice(0, autocomplete.triggerIndex);
    const after = text.slice(autocomplete.triggerIndex + 1 + autocomplete.query.length);
    const prefix = autocomplete.kind === 'user' ? '@' : '#';
    const token = `${prefix}${item.label}`;
    setText(`${before}${token} ${after}`);
    setPendingMentions((prev) => [...prev, { token, label: item.label, id: item.id, kind: autocomplete.kind }]);
    setAutocomplete(null);
    const caretPos = before.length + token.length + 1;
    setCursor(caretPos);
    setForcedSelection({ start: caretPos, end: caretPos });
  };

  const buildBodyForSend = (): string => {
    let body = text;
    const sorted = [...pendingMentions].sort((a, b) => b.token.length - a.token.length);
    for (const m of sorted) {
      const wrapped = m.kind === 'user' ? `@[${m.label}](${m.id})` : `#[${m.label}](${m.id})`;
      body = body.split(m.token).join(wrapped);
    }
    return body;
  };

  const handleSend = async () => {
    const body = buildBodyForSend();
    if (!body.trim() || sending) return;
    setSending(true);
    const { error } = await sendMessage(channelId, companyId, userId, body, parentMessageId ?? null);
    setSending(false);
    if (!error) {
      setText('');
      setPendingMentions([]);
      onSent?.();
    }
  };

  return (
    <View>
      {autocomplete && autocompleteResults.length > 0 && (
        <View style={[styles.autocomplete, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {autocompleteResults.map((item) => (
            <Pressable key={item.id} onPress={() => selectAutocomplete(item)} style={styles.autocompleteItem}>
              <Text style={{ color: theme.textSecondary }}>{autocomplete.kind === 'user' ? '@' : '#'}</Text>
              <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <TextInput
          value={text}
          selection={forcedSelection}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          placeholder={placeholder || 'Message... (@ to mention, # for a channel)'}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          multiline
        />
        <Pressable onPress={handleSend} disabled={sending || !text.trim()} style={{ opacity: sending || !text.trim() ? 0.4 : 1 }}>
          <Send size={20} color={theme.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  autocomplete: { position: 'absolute', bottom: '100%', left: 0, right: 60, marginBottom: 8, borderRadius: Radii.badge, borderWidth: 1, overflow: 'hidden', zIndex: 20 },
  autocompleteItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 10, borderRadius: 20, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, maxHeight: 120, paddingVertical: 6 },
});
