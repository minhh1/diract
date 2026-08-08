import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toDateStr } from '@/lib/calendarDate';

// Native, read-only port of components/calendar/RosterWeekView.tsx (web) --
// the kiosk never gets the admin edit/add affordances that component's
// isAdmin={true} branch renders, so this only needs the display half: a
// staff (rows) x day-of-week (columns) grid. Horizontally scrollable since
// 7 fixed-width day columns don't fit a phone-width screen; the kiosk is an
// iPad in practice, but this degrades gracefully either way.
export interface RosterShift {
  id: string;
  staff_entity_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role_note: string | null;
  status: 'draft' | 'final';
}
export interface RosterStaff { id: string; name: string }

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NAME_COL_WIDTH = 110;
const DAY_COL_WIDTH = 92;

function timeLabel(t: string): string {
  return t.slice(0, 5);
}

export function KioskRosterWeek({ weekDays, shifts, staff }: { weekDays: Date[]; shifts: RosterShift[]; staff: RosterStaff[] }) {
  const theme = useTheme();
  const today = toDateStr(new Date());

  const shiftsFor = (staffId: string, date: string) => shifts.filter((s) => s.staff_entity_id === staffId && s.shift_date === date);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.headerRow}>
          <View style={{ width: NAME_COL_WIDTH }} />
          {weekDays.map((d, i) => {
            const isToday = toDateStr(d) === today;
            return (
              <View key={i} style={[styles.dayHeader, { width: DAY_COL_WIDTH, backgroundColor: isToday ? theme.backgroundSelected : 'transparent' }]}>
                <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{DAY_LABELS[i]}</Text>
                <Text style={[styles.dayNum, { color: theme.text }]}>{d.getDate()}</Text>
              </View>
            );
          })}
        </View>

        {staff.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>No staff found for this company.</Text>
        ) : (
          staff.map((member) => (
            <View key={member.id} style={styles.staffRow}>
              <View style={{ width: NAME_COL_WIDTH, justifyContent: 'center' }}>
                <Text style={[styles.staffName, { color: theme.text }]} numberOfLines={1}>{member.name}</Text>
              </View>
              {weekDays.map((d, i) => {
                const dateStr = toDateStr(d);
                const dayShifts = shiftsFor(member.id, dateStr);
                return (
                  <View key={i} style={[styles.cell, { width: DAY_COL_WIDTH, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                    {dayShifts.map((s) => (
                      <View
                        key={s.id}
                        style={[
                          styles.chip,
                          s.status === 'draft'
                            ? { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.accent, backgroundColor: theme.backgroundSelected }
                            : { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: theme.accent }]}>{timeLabel(s.start_time)}-{timeLabel(s.end_time)}</Text>
                        {!!s.role_note && <Text style={[styles.chipNote, { color: theme.accent }]} numberOfLines={1}>{s.role_note}</Text>}
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  dayHeader: { alignItems: 'center', paddingVertical: 6, borderRadius: Radii.badge, marginHorizontal: 2 },
  dayLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNum: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  empty: { fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 32 },
  staffRow: { flexDirection: 'row', marginBottom: 6 },
  staffName: { fontSize: 11, fontWeight: '700', paddingRight: 8 },
  cell: { minHeight: 52, borderRadius: Radii.badge, borderWidth: 1, padding: 4, marginHorizontal: 2, gap: 3 },
  chip: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3 },
  chipText: { fontSize: 9, fontWeight: '700' },
  chipNote: { fontSize: 8, fontWeight: '500', opacity: 0.8 },
});
