import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessageSquare, Pencil, Smile, Trash2 } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toggleReaction, deleteMessage, editMessage, type CompanyMember, type MessageWithMeta } from '@/lib/messaging';

// Native port of components/messaging/MessageBubble.tsx. Same minimal
// formatting scope (mention/#channel chips + bold/italic/code/auto-linked
// URLs, one non-nested regex pass -- no full markdown). Hover actions have
// no touch equivalent, so the action row (react/reply/edit/delete) opens
// via long-press into a small action sheet instead of a hover-reveal bar.
const QUICK_EMOJI = ['👍', '❤️', '😄', '🎉', '👀'];
const MENTION_OR_CHANNEL_RE = /(@\[[^\]]+\]\([0-9a-f-]{36}\))|(#\[[^\]]+\]\([0-9a-f-]{36}\))/gi;
const INLINE_FORMAT_RE = /(\*\*[^*]+\*\*)|(_[^_]+_)|(`[^`]+`)|(https?:\/\/\S+)/g;

function renderInline(text: string, keyPrefix: string, baseStyle: object, theme: ReturnType<typeof useTheme>) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE_FORMAT_RE.lastIndex = 0;
  while ((match = INLINE_FORMAT_RE.exec(text))) {
    if (match.index > lastIndex) parts.push(<Text key={`${keyPrefix}-t${i++}`} style={baseStyle}>{text.slice(lastIndex, match.index)}</Text>);
    if (match[1]) parts.push(<Text key={`${keyPrefix}-b${i++}`} style={[baseStyle, styles.bold]}>{match[1].slice(2, -2)}</Text>);
    else if (match[2]) parts.push(<Text key={`${keyPrefix}-i${i++}`} style={[baseStyle, styles.italic]}>{match[2].slice(1, -1)}</Text>);
    else if (match[3]) parts.push(
      <Text key={`${keyPrefix}-c${i++}`} style={[baseStyle, styles.code, { backgroundColor: theme.backgroundSelected }]}>{match[3].slice(1, -1)}</Text>
    );
    else if (match[4]) parts.push(<Text key={`${keyPrefix}-u${i++}`} style={[baseStyle, { color: theme.accent, textDecorationLine: 'underline' }]}>{match[4]}</Text>);
    lastIndex = INLINE_FORMAT_RE.lastIndex;
  }
  if (lastIndex < text.length) parts.push(<Text key={`${keyPrefix}-r`} style={baseStyle}>{text.slice(lastIndex)}</Text>);
  return parts;
}

export function renderMessageBody(body: string, baseStyle: object, theme: ReturnType<typeof useTheme>) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  MENTION_OR_CHANNEL_RE.lastIndex = 0;
  const chipStyle = [styles.chip, { color: theme.accent, backgroundColor: theme.backgroundSelected }];
  while ((match = MENTION_OR_CHANNEL_RE.exec(body))) {
    if (match.index > lastIndex) parts.push(...renderInline(body.slice(lastIndex, match.index), `t${key++}`, baseStyle, theme));
    if (match[1]) {
      const label = match[1].match(/@\[([^\]]+)\]/)?.[1] ?? '';
      parts.push(<Text key={`m${key++}`} style={chipStyle}>@{label}</Text>);
    } else if (match[2]) {
      const label = match[2].match(/#\[([^\]]+)\]/)?.[1] ?? '';
      parts.push(<Text key={`m${key++}`} style={chipStyle}>#{label}</Text>);
    }
    lastIndex = MENTION_OR_CHANNEL_RE.lastIndex;
  }
  if (lastIndex < body.length) parts.push(...renderInline(body.slice(lastIndex), `t${key++}`, baseStyle, theme));
  return parts;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  message: MessageWithMeta;
  sender: CompanyMember | undefined;
  currentUserId: string;
  isAdmin: boolean;
  onOpenThread?: (messageId: string) => void;
  showThreadAction?: boolean;
}

export function MessageBubble({ message, sender, currentUserId, isAdmin, onOpenThread, showThreadAction = true }: Props) {
  const theme = useTheme();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  const canEdit = message.user_id === currentUserId;
  const canDelete = message.user_id === currentUserId || isAdmin;
  const label = sender?.full_name || sender?.email || 'Unknown';

  const reactionGroups = message.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count += 1;
    if (r.user_id === currentUserId) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const handleReact = async (emoji: string) => {
    setActionsOpen(false);
    await toggleReaction(message.id, currentUserId, emoji);
  };

  const handleSaveEdit = async () => {
    if (editText.trim() && editText !== message.body) await editMessage(message.id, editText);
    setEditing(false);
  };

  const handleDelete = () => {
    setActionsOpen(false);
    Alert.alert('Delete this message?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(message.id) },
    ]);
  };

  if (message.deleted_at) {
    return (
      <View style={styles.row}>
        <View style={styles.avatarSpacer} />
        <Text style={[styles.deleted, { color: theme.textSecondary }]}>Message deleted</Text>
      </View>
    );
  }

  const bodyStyle = { fontSize: 14, color: theme.text, lineHeight: 20 };

  return (
    <Pressable style={styles.row} onLongPress={() => setActionsOpen(true)}>
      <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
        <Text style={[styles.avatarText, { color: theme.accent }]}>{label.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.sender, { color: theme.text }]}>{label}</Text>
          <Text style={[styles.time, { color: theme.textSecondary }]}>
            {timeLabel(message.created_at)}{message.edited_at ? ' (edited)' : ''}
          </Text>
        </View>

        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              autoFocus
              style={[styles.editInput, { borderColor: theme.border, color: theme.text }]}
              onSubmitEditing={handleSaveEdit}
            />
            <Pressable onPress={handleSaveEdit}><Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>Save</Text></Pressable>
            <Pressable onPress={() => setEditing(false)}><Text style={{ color: theme.textSecondary, fontSize: 12 }}>Cancel</Text></Pressable>
          </View>
        ) : (
          <Text style={bodyStyle}>{renderMessageBody(message.body, bodyStyle, theme)}</Text>
        )}

        {Object.keys(reactionGroups).length > 0 && (
          <View style={styles.reactionsRow}>
            {Object.entries(reactionGroups).map(([emoji, { count, mine }]) => (
              <Pressable
                key={emoji}
                onPress={() => handleReact(emoji)}
                style={[
                  styles.reactionPill,
                  { borderColor: mine ? theme.accent : theme.border, backgroundColor: mine ? theme.backgroundSelected : 'transparent' },
                ]}
              >
                <Text style={{ fontSize: 12 }}>{emoji}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: mine ? theme.accent : theme.textSecondary }}>{count}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {showThreadAction && message.reply_count > 0 && (
          <Pressable onPress={() => onOpenThread?.(message.id)}>
            <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12, marginTop: 4 }}>
              {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
            </Text>
          </Pressable>
        )}
      </View>

      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setActionsOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.emojiRow}>
              {QUICK_EMOJI.map((emoji) => (
                <Pressable key={emoji} onPress={() => handleReact(emoji)}><Text style={{ fontSize: 24 }}>{emoji}</Text></Pressable>
              ))}
            </View>
            {showThreadAction && (
              <Pressable style={styles.sheetItem} onPress={() => { setActionsOpen(false); onOpenThread?.(message.id); }}>
                <MessageSquare size={16} color={theme.text} />
                <Text style={[styles.sheetItemText, { color: theme.text }]}>Reply in thread</Text>
              </Pressable>
            )}
            {canEdit && (
              <Pressable style={styles.sheetItem} onPress={() => { setActionsOpen(false); setEditing(true); }}>
                <Pencil size={16} color={theme.text} />
                <Text style={[styles.sheetItemText, { color: theme.text }]}>Edit</Text>
              </Pressable>
            )}
            {canDelete && (
              <Pressable style={styles.sheetItem} onPress={handleDelete}>
                <Trash2 size={16} color={theme.danger} />
                <Text style={[styles.sheetItemText, { color: theme.danger }]}>Delete</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
  avatarSpacer: { width: 30 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800' },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  sender: { fontSize: 13, fontWeight: '700' },
  time: { fontSize: 10 },
  deleted: { fontSize: 12, fontStyle: 'italic' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'ui-monospace', fontSize: 12, paddingHorizontal: 3, borderRadius: 4 },
  chip: { fontWeight: '700', paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radii.card, borderTopRightRadius: Radii.card, padding: 20, gap: 16, paddingBottom: 36 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  sheetItemText: { fontSize: 14, fontWeight: '600' },
});
