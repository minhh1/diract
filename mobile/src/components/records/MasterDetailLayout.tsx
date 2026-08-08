import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMasterDetailPanel } from '@/lib/masterDetailPanel';

const HANDLE_SIZE = 32;

// iPad-only two-pane layout for a list + its detail view, both visible at
// once. Plain and presentational -- selection state lives in the route
// file (query-param-driven, see e.g. matters/index.tsx), not here.
//
// The list pane's open/closed state is shared (see masterDetailPanel.tsx)
// with the sidebar rail -- tapping the already-active rail item toggles
// it too, not just this handle. The handle straddles the divider (not
// overlaid on either pane's own content, so it never collides with the
// list's search bar or the detail's title) and disappears entirely once
// the pane is closed -- reopening it is the rail's job at that point, per
// the same reasoning "collapse" affordances in this shape usually only
// show going one direction.
//
// Callers use this with `headerShown: false` (no native header to clear
// the status bar/notch for us, unlike the phone-only push navigation both
// panes' components were originally built for) -- insets.top stands in
// for that here, once, for both panes, rather than in every one of the 4
// route files that render this.
export function MasterDetailLayout({
  list,
  detail,
  listWidth = 340,
}: {
  list: ReactNode;
  detail: ReactNode;
  listWidth?: number;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isOpen, toggle } = useMasterDetailPanel();

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
      {isOpen && (
        <View style={{ width: listWidth, paddingTop: insets.top, borderRightWidth: 1, borderRightColor: theme.border }}>
          {list}
        </View>
      )}
      <View style={{ flex: 1, paddingTop: insets.top }}>{detail}</View>

      {isOpen && (
        <Pressable
          onPress={toggle}
          accessibilityLabel="Expand to full view"
          style={{
            position: 'absolute',
            top: '50%',
            left: listWidth - HANDLE_SIZE / 2,
            marginTop: -HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: Radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.backgroundElement,
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <ChevronLeft size={16} color={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}
