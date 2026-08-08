import { Tabs } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Briefcase, CheckSquare, LayoutDashboard, MoreHorizontal, Users } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useIsTabletLayout } from '@/hooks/use-tablet-layout';
import { useSession } from '@/lib/session';
import { MasterDetailPanelProvider } from '@/lib/masterDetailPanel';
import { SidebarContent } from '@/components/navigation/SidebarContent';
import { KioskScreen } from '@/components/kiosk/KioskScreen';

// Matches components/Sidebar.tsx's rail width (w-16, 64px) plus a little
// extra for the label each item keeps underneath (see SidebarContent).
const RAIL_WIDTH = 80;

const NAV_ITEMS = [
  { name: 'matters', title: 'Matters', Icon: Briefcase },
  { name: 'leads', title: 'Leads', Icon: Users },
  { name: 'tasks', title: 'Tasks', Icon: CheckSquare },
  { name: 'dashboards', title: 'Dashboards', Icon: LayoutDashboard },
  { name: 'more', title: 'More', Icon: MoreHorizontal },
] as const;

export default function AppLayout() {
  const theme = useTheme();
  const isTablet = useIsTabletLayout();
  const { role } = useSession();

  // A kiosk-role session (a shared device signed in with an admin-created
  // login, see components/KioskAppShell.tsx on web) gets no tab bar/drawer
  // at all -- just the restricted check-in/roster screen, regardless of
  // phone or tablet layout. Unlike web (which has to redirect away from
  // other routes someone could type in a URL bar), there's no navigator
  // mounted here at all for this role, so there's nothing else to route to
  // in the first place.
  if (role === 'kiosk') {
    return <KioskScreen />;
  }

  // iPad: a permanent drawer (an always-open sidebar, not an overlay --
  // see SidebarContent's own comment on why this needs custom content
  // rather than the default DrawerItemList) replaces the bottom tab bar.
  // Fixed rail width regardless of how wide the window gets, matching the
  // web app's rail (components/Sidebar.tsx) -- it doesn't grow into a
  // labeled panel at any breakpoint either. Route directories underneath
  // (matters/, leads/, etc.) are unchanged -- expo-router's navigators are
  // decoupled from route structure, so the same 5 directories work under
  // either Tabs or Drawer.
  if (isTablet) {
    return (
      <MasterDetailPanelProvider>
        <Drawer
          drawerContent={(props) => <SidebarContent {...props} />}
          screenOptions={{
            headerShown: false,
            drawerType: 'permanent',
            drawerStyle: {
              width: RAIL_WIDTH,
              backgroundColor: theme.backgroundElement,
              borderRightColor: theme.border,
              borderRightWidth: 1,
            },
          }}
        >
          {NAV_ITEMS.map(({ name, title, Icon }) => (
            <Drawer.Screen
              key={name}
              name={name}
              options={{ title, drawerIcon: ({ color, size }) => <Icon color={color} size={size} /> }}
            />
          ))}
        </Drawer>
      </MasterDetailPanelProvider>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
      }}
    >
      {NAV_ITEMS.map(({ name, title, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{ title, tabBarIcon: ({ color, size }) => <Icon color={color} size={size} /> }}
        />
      ))}
    </Tabs>
  );
}
