import { Platform, useWindowDimensions } from 'react-native';

// Live width, not a static device check -- Platform.isPad alone stays true
// even when an iPad is in a narrow Slide Over pane or a 1/3 Split View, so
// combining it with the current window width is what makes those cases
// correctly fall back to the phone layout instead of squeezing a sidebar +
// master-detail view into ~320-420pt. Gated to iOS+isPad specifically (not
// just "wide window") so Android tablets/web keep the phone layout
// unchanged -- this is iPad-specific work, not general tablet support.
const TABLET_MIN_WIDTH = 700;

function isPad(): boolean {
  return Platform.OS === 'ios' && Platform.isPad;
}

// Sidebar nav + master-detail split views turn on above this width. iPad
// mini portrait (744pt) lands just inside this -- intentional, the rail
// stays a fixed narrow width regardless, so there's no squeeze to worry
// about at any width above this.
export function useIsTabletLayout(): boolean {
  const { width } = useWindowDimensions();
  return isPad() && width >= TABLET_MIN_WIDTH;
}

// iPhone/Android are always portrait-locked (see use-orientation-lock.ts),
// so this is only ever true on iPad -- a plain width > height check is
// enough without re-checking isPad, but it's included anyway to document
// that this is deliberately iPad-only, matching the other two hooks above.
export function useIsLandscapeTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return isPad() && width > height;
}
