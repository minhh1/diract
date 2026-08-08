import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DrawerContentComponentProps } from 'expo-router/drawer';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMasterDetailPanel } from '@/lib/masterDetailPanel';

// Sections whose top-level screen renders a MasterDetailLayout -- tapping
// the rail item for whichever of these is already active toggles that
// list pane instead of just re-navigating to an already-active route
// (which expo-router would no-op anyway). Tasks shows the same
// self-contained Task Page UI (tabs + list + modal detail) regardless of
// screen size rather than a list/detail split -- see tasks/index.tsx's own
// comment -- so it's not in this set; Dashboards/More were never
// master-detail at their top level either.
const MASTER_DETAIL_ROUTES = new Set(['matters', 'leads']);

// Custom drawerContent for the iPad permanent sidebar (see (app)/_layout.tsx)
// -- a fixed-width icon rail, matching the web app's always-visible rail
// (components/Sidebar.tsx) rather than switching to a wider labeled panel
// at any breakpoint. Unlike web's rail (hover tooltips for labels, no touch
// input), each icon keeps a small label underneath -- a touch UI has no
// hover state to reveal it otherwise. Only 6 fixed top-level sections, so
// no scroll container is needed either.
//
// The Drawer has headerShown: false (no native header to push content
// below the status bar for us, unlike the phone tab bar's per-screen
// Stack headers) -- insets.top stands in for that here.
export function SidebarContent({ state, navigation, descriptors }: DrawerContentComponentProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const panel = useMasterDetailPanel();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? theme.accent : theme.textSecondary;
        const label = typeof options.title === 'string' ? options.title : route.name;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              if (focused && MASTER_DETAIL_ROUTES.has(route.name)) {
                panel.toggle();
              } else {
                panel.open();
                navigation.navigate(route.name);
              }
            }}
            style={[styles.item, focused && { backgroundColor: theme.backgroundSelected }]}
          >
            {options.drawerIcon?.({ color, size: 21, focused })}
            <Text numberOfLines={1} style={[styles.label, { color }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  item: { width: '100%', alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: Radii.badge },
  label: { fontSize: 10, fontWeight: '700' },
});
