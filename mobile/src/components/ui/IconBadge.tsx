import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconBadgeColors } from '@/constants/theme';

// A vivid, solid-color circular icon background -- quick-action grids
// (e.g. More screen's shortcut rows) cycle through IconBadgeColors by
// index instead of every action picking its own one-off color, matching
// Canva's "Get started" row.
export function IconBadge({ index, size = 52, children }: { index: number; size?: number; children: ReactNode }) {
  const color = IconBadgeColors[index % IconBadgeColors.length];
  return <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>{children}</View>;
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
