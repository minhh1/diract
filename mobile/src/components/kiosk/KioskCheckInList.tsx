import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Circle, Clock } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { callApi } from '@/lib/api';
import { KioskPinPad } from './KioskPinPad';

// Native port of components/kiosk/CheckInPanel.tsx (web) -- same
// /api/kiosk/checkins GET/POST endpoints, tap-to-toggle check in/out. QR
// scanning (the web version's other entry point) isn't ported -- that
// needs a camera permission + scanner dependency this app doesn't have
// yet; tap-to-toggle (with the PIN pad below whenever one's set) covers
// the same commit path a scan would otherwise route into.
interface Shift {
  id: string;
  staff_entity_id: string;
  start_time: string;
  end_time: string;
  role_note: string | null;
}
interface Staff { id: string; name: string; hasPin: boolean }
interface Checkin {
  id: string;
  roster_shift_id: string | null;
  staff_entity_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
}
type CommitResult = { ok: true } | { ok: false; error: string };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

export function KioskCheckInList() {
  const theme = useTheme();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<Shift | null>(null);

  const load = useCallback(async () => {
    const res = await callApi('/api/kiosk/checkins');
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setShifts(data.shifts ?? []);
      setStaff(data.staff ?? []);
      setCheckins(data.checkins ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCheckinFor = (staffEntityId: string) =>
    checkins.find((c) => c.staff_entity_id === staffEntityId && !c.checked_out_at);

  const commit = async (shift: Shift, pin?: string): Promise<CommitResult> => {
    const open = openCheckinFor(shift.staff_entity_id);
    setActingId(shift.id);
    const res = await callApi('/api/kiosk/checkins', {
      method: 'POST',
      body: JSON.stringify(open
        ? { action: 'check_out', staff_entity_id: shift.staff_entity_id, pin }
        : { action: 'check_in', staff_entity_id: shift.staff_entity_id, roster_shift_id: shift.id, pin }),
    });
    const data = await res.json().catch(() => null);
    setActingId(null);
    if (res.ok && data?.checkin) {
      setCheckins((prev) => (open
        ? prev.map((c) => (c.id === data.checkin.id ? data.checkin : c))
        : [...prev, data.checkin]));
      return { ok: true };
    }
    return { ok: false, error: data?.error ?? 'Something went wrong' };
  };

  const handleTap = (shift: Shift) => {
    const member = staff.find((s) => s.id === shift.staff_entity_id);
    if (member?.hasPin) { setPinTarget(shift); return; }
    commit(shift);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={theme.textSecondary} /></View>;
  }

  if (shifts.length === 0) {
    return <Text style={[styles.empty, { color: theme.textSecondary }]}>No one is rostered on today.</Text>;
  }

  return (
    <View style={{ gap: 10 }}>
      {shifts.map((shift) => {
        const member = staff.find((s) => s.id === shift.staff_entity_id);
        const open = openCheckinFor(shift.staff_entity_id);
        const acting = actingId === shift.id;
        return (
          <Pressable
            key={shift.id}
            disabled={acting}
            onPress={() => handleTap(shift)}
            style={[
              styles.row,
              { backgroundColor: open ? theme.successBackground : theme.backgroundElement, borderColor: open ? theme.success : theme.border, opacity: acting ? 0.6 : 1 },
            ]}
          >
            {acting ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : open ? (
              <CheckCircle2 size={22} color={theme.success} />
            ) : (
              <Circle size={22} color={theme.textSecondary} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{member?.name ?? 'Unknown'}</Text>
              <View style={styles.timeRow}>
                <Clock size={10} color={theme.textSecondary} />
                <Text style={[styles.time, { color: theme.textSecondary }]}>
                  {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}{shift.role_note ? ` · ${shift.role_note}` : ''}
                </Text>
              </View>
            </View>
            <Text style={[styles.status, { color: open ? theme.success : theme.textSecondary }]}>
              {open ? `Checked in ${fmtTime(open.checked_in_at)} · Tap to check out` : member?.hasPin ? 'Tap to enter PIN' : 'Tap to check in'}
            </Text>
          </Pressable>
        );
      })}

      {pinTarget && (
        <KioskPinPad
          name={staff.find((s) => s.id === pinTarget.staff_entity_id)?.name ?? 'Staff member'}
          checkingOut={!!openCheckinFor(pinTarget.staff_entity_id)}
          onCancel={() => setPinTarget(null)}
          onSubmit={async (pin) => {
            const result = await commit(pinTarget, pin);
            if (result.ok) setPinTarget(null);
            return result;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 16, borderRadius: Radii.card, borderWidth: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { fontSize: 11 },
  status: { fontSize: 11, fontWeight: '700', flexShrink: 0 },
});
