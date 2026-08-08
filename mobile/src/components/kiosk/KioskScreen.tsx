import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, LogOut, Tablet } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { useCompanyMemberships } from '@/lib/companies';
import { callApi } from '@/lib/api';
import { getMonthDays, getWeekDays, toDateStr } from '@/lib/calendarDate';
import { KioskCheckInList } from './KioskCheckInList';
import { KioskRosterWeek, type RosterShift, type RosterStaff } from './KioskRosterWeek';
import { KioskRosterMonth } from './KioskRosterMonth';
import { KioskHoursSummary } from './KioskHoursSummary';

type CalendarView = 'day' | 'week' | 'month';
type CalendarSettings = { enabled: boolean; rostering_enabled: boolean };

// The native counterpart to components/KioskAppShell.tsx +
// app/(app)/dashboard/calendar/page.tsx's kiosk branch (web): a kiosk-role
// session sees nothing but this screen -- no tab bar/drawer at all (see
// (app)/_layout.tsx, which renders this in place of the normal navigator
// rather than as one more screen inside it), just today's check-in panel
// plus read-only Weekly/Monthly roster views and an hours-worked summary.
export function KioskScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useSession();
  const { data: memberships } = useCompanyMemberships(profile?.id ?? null);
  const companyName = memberships?.find((m) => m.company_id === profile?.active_company_id)?.company?.name ?? null;

  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [view, setView] = useState<CalendarView>('day');
  const [viewDate, setViewDate] = useState(new Date());
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [staff, setStaff] = useState<RosterStaff[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  useEffect(() => {
    callApi('/api/calendar/settings').then((res) => res.json()).then((json) => setSettings(json.settings));
  }, []);

  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);
  const monthDays = useMemo(() => getMonthDays(viewDate), [viewDate]);
  const rangeStart = view === 'month' ? toDateStr(monthDays.find((d): d is Date => !!d) ?? viewDate) : toDateStr(weekDays[0]);
  const rangeEnd = view === 'month' ? toDateStr([...monthDays].reverse().find((d): d is Date => !!d) ?? viewDate) : toDateStr(weekDays[6]);

  const loadShifts = useCallback(async () => {
    if (!settings?.rostering_enabled || view === 'day') return;
    setLoadingShifts(true);
    const res = await callApi(`/api/calendar/roster/shifts?start=${rangeStart}&end=${rangeEnd}`);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setShifts(json.shifts ?? []);
      setStaff(json.staff ?? []);
    }
    setLoadingShifts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.rostering_enabled, view, rangeStart, rangeEnd]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const goToday = () => setViewDate(new Date());
  const handlePrev = () => setViewDate((d) => { const n = new Date(d); if (view === 'month') n.setMonth(n.getMonth() - 1); else n.setDate(n.getDate() - 7); return n; });
  const handleNext = () => setViewDate((d) => { const n = new Date(d); if (view === 'month') n.setMonth(n.getMonth() + 1); else n.setDate(n.getDate() + 7); return n; });

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <View style={styles.headerLeft}>
          <Tablet size={16} color={theme.accent} />
          <Text style={[styles.companyName, { color: theme.text }]} numberOfLines={1}>{companyName ?? 'Kiosk'}</Text>
        </View>
        <Pressable onPress={() => signOut()} style={styles.signOut}>
          <LogOut size={13} color={theme.textSecondary} />
          <Text style={[styles.signOutText, { color: theme.textSecondary }]}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!settings ? (
          <ActivityIndicator color={theme.textSecondary} style={{ marginTop: 40 }} />
        ) : !settings.enabled ? (
          <Text style={[styles.notice, { color: theme.textSecondary }]}>Calendar isn&apos;t turned on for this company yet.</Text>
        ) : (
          <>
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]}>
                  {view === 'day'
                    ? new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
                    : viewDate.toLocaleString('en-AU', { month: 'long', year: 'numeric' })}
                </Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {view === 'day' ? 'Tap your name to check in or out' : 'Staff roster'}
                </Text>
              </View>
            </View>

            <View style={styles.toolbar}>
              <View style={[styles.pillGroup, { backgroundColor: theme.backgroundSelected }]}>
                {(['day', 'week', 'month'] as CalendarView[]).map((v) => (
                  <Pressable key={v} onPress={() => setView(v)} style={[styles.pill, view === v && { backgroundColor: theme.backgroundElement }]}>
                    <Text style={{ color: view === v ? theme.accent : theme.textSecondary, fontSize: 10, fontWeight: '800' }}>
                      {v === 'day' ? 'Today' : v === 'week' ? 'Weekly' : 'Monthly'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {view !== 'day' && (
                <View style={styles.navGroup}>
                  <Pressable onPress={goToday} style={[styles.navButton, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.text, fontSize: 10, fontWeight: '700' }}>Today</Text>
                  </Pressable>
                  <Pressable onPress={handlePrev} style={[styles.navIconButton, { borderColor: theme.border }]}>
                    <ChevronLeft size={14} color={theme.text} />
                  </Pressable>
                  <Pressable onPress={handleNext} style={[styles.navIconButton, { borderColor: theme.border }]}>
                    <ChevronRight size={14} color={theme.text} />
                  </Pressable>
                </View>
              )}
            </View>

            {!settings.rostering_enabled ? (
              <Text style={[styles.notice, { color: theme.textSecondary }]}>Rostering isn&apos;t turned on for this company yet.</Text>
            ) : view === 'day' ? (
              <KioskCheckInList />
            ) : loadingShifts ? (
              <ActivityIndicator color={theme.textSecondary} style={{ marginTop: 24 }} />
            ) : (
              <View style={{ gap: 16 }}>
                {view === 'week' ? (
                  <KioskRosterWeek weekDays={weekDays} shifts={shifts} staff={staff} />
                ) : (
                  <KioskRosterMonth monthDays={monthDays} shifts={shifts} />
                )}
                <KioskHoursSummary start={rangeStart} end={rangeEnd} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  companyName: { fontSize: 13, fontWeight: '700' },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  signOutText: { fontSize: 12, fontWeight: '600' },
  content: { padding: 20, gap: 16 },
  notice: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '300', textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, marginTop: 2 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  pillGroup: { flexDirection: 'row', borderRadius: Radii.pill, padding: 2 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radii.pill },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radii.pill, borderWidth: 1 },
  navIconButton: { padding: 7, borderRadius: Radii.pill, borderWidth: 1 },
});
