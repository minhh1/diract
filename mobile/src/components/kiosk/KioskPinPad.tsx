import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Delete, X } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CommitResult = { ok: true } | { ok: false; error: string };

// Native port of components/kiosk/CheckInPanel.tsx's PinPadModal (web) --
// shown whenever the tapped staff member has a checkin_pin_hash set (see
// KioskCheckInList's hasPin check), same 4-6 digit pad and the same
// onSubmit contract (resolves { ok } so the caller decides whether to
// close the pad or show the server's error and let them retry).
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function KioskPinPad({ name, checkingOut, onCancel, onSubmit }: {
  name: string;
  checkingOut: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<CommitResult>;
}) {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (digit: string) => {
    if (busy || pin.length >= 6) return;
    setError(null);
    setPin((prev) => prev + digit);
  };
  const backspace = () => { if (!busy) { setError(null); setPin((prev) => prev.slice(0, -1)); } };
  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    const result = await onSubmit(pin);
    setBusy(false);
    if (!result.ok) { setError(result.error); setPin(''); }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.header}>
            <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
            <Pressable onPress={onCancel} hitSlop={8}><X size={18} color={theme.textSecondary} /></Pressable>
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter your PIN to {checkingOut ? 'check out' : 'check in'}
          </Text>

          <View style={styles.dots}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.dot, { borderColor: theme.border }, i < pin.length && { backgroundColor: theme.text, borderColor: theme.text }]} />
            ))}
          </View>
          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

          <View style={styles.grid}>
            {DIGITS.map((d) => (
              <Pressable key={d} onPress={() => press(d)} disabled={busy} style={[styles.key, { backgroundColor: theme.background }]}>
                <Text style={[styles.keyText, { color: theme.text }]}>{d}</Text>
              </Pressable>
            ))}
            <Pressable onPress={backspace} disabled={busy} style={[styles.key, { backgroundColor: theme.background }]}>
              <Delete size={18} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => press('0')} disabled={busy} style={[styles.key, { backgroundColor: theme.background }]}>
              <Text style={[styles.keyText, { color: theme.text }]}>0</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={busy || pin.length < 4} style={[styles.key, { backgroundColor: theme.text, opacity: busy || pin.length < 4 ? 0.3 : 1 }]}>
              {busy ? <ActivityIndicator size="small" color={theme.background} /> : <CheckCircle2 size={18} color={theme.background} />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, borderRadius: Radii.card, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 4, marginBottom: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  error: { textAlign: 'center', fontSize: 12, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  key: { width: '30%', paddingVertical: 16, borderRadius: Radii.badge, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 18, fontWeight: '700' },
});
