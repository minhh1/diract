import { StyleSheet, Text, View } from 'react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toDateStr } from '@/lib/calendarDate';
import type { RosterShift } from './KioskRosterWeek';

// Native, read-only port of the month-view grid in
// app/(app)/dashboard/calendar/page.tsx's kiosk branch (web) -- date
// number + shift count per day, no event dots (kiosk deliberately never
// fetches calendar_date_sources, see that file's own comment on why).
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function KioskRosterMonth({ monthDays, shifts }: { monthDays: (Date | null)[]; shifts: RosterShift[] }) {
  const theme = useTheme();
  const today = toDateStr(new Date());

  return (
    <View style={styles.grid}>
      {DAY_LABELS.map((d) => (
        <View key={d} style={styles.dayLabelCell}>
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{d}</Text>
        </View>
      ))}
      {monthDays.map((date, i) => {
        const dateStr = date ? toDateStr(date) : null;
        const count = dateStr ? shifts.filter((s) => s.shift_date === dateStr).length : 0;
        const isToday = dateStr === today;
        return (
          <View
            key={i}
            style={[
              styles.dayCell,
              date ? { backgroundColor: theme.backgroundElement, borderColor: theme.border } : { borderColor: 'transparent' },
              isToday && { borderColor: theme.accent, borderWidth: 2 },
            ]}
          >
            {date && (
              <>
                <Text style={[styles.dateNum, { color: isToday ? theme.accent : theme.textSecondary }]}>{date.getDate()}</Text>
                {count > 0 && <Text style={[styles.shiftCount, { color: theme.accent }]}>{count} shift{count !== 1 ? 's' : ''}</Text>}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayLabelCell: { width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 6 },
  dayLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCell: { width: `${100 / 7}%`, minHeight: 56, padding: 6, borderWidth: 1, borderRadius: Radii.badge },
  dateNum: { fontSize: 11, fontWeight: '800' },
  shiftCount: { fontSize: 8, fontWeight: '700', marginTop: 2 },
});
