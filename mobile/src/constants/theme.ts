/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// A vivid purple/blue accent pair (plus a rotating set of solid "icon
// badge" colors) carried across both themes -- the same design language,
// not a light reskin of separate ones. Dark is the flagship look (near-
// black surfaces, a soft gradient wash top-of-screen, glowing focus
// states); light keeps the same accent/radii/badge language on a plain
// white surface since a neon glow doesn't read on white.
export const Colors = {
  light: {
    text: '#15151F',
    background: '#F6F5FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F1ECFE',
    textSecondary: '#6B6B7C',
    border: '#E7E5F0',
    accent: '#7C3AED',
    accentSecondary: '#0EA5E9',
    dangerBackground: '#FDECEC',
    successBackground: '#E7F8EF',
    danger: '#DC2626',
    success: '#059669',
  },
  dark: {
    text: '#F5F4FA',
    background: '#0A0A12',
    backgroundElement: '#17171F',
    backgroundSelected: '#221F33',
    textSecondary: '#9B99AC',
    border: '#2A2836',
    accent: '#A78BFA',
    accentSecondary: '#22D3EE',
    dangerBackground: '#2E1620',
    successBackground: '#0F2A22',
    danger: '#F87171',
    success: '#34D399',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Gradient stops (hero backgrounds, primary buttons, brand mark) --
// distinct from `accent`/`accentSecondary` above because a couple of uses
// (the sign-in hero wash) want the reverse direction or a third stop.
export const Gradients = {
  light: {
    hero: ['#BAE6FD', '#DDD6FE'] as const,
    primary: ['#0EA5E9', '#7C3AED'] as const,
  },
  dark: {
    hero: ['#0F2E3D', '#1B1030'] as const,
    primary: ['#22D3EE', '#A78BFA'] as const,
  },
} as const;

// Solid, vivid backgrounds for circular icon badges (quick-action grids,
// category shortcuts) -- cycle through these by index rather than fixing
// one color per feature, matching Canva's "Get started" row.
export const IconBadgeColors = ['#8B5CF6', '#F43F5E', '#3B82F6', '#14B8A6', '#F97316', '#EC4899', '#6366F1', '#22C55E'] as const;

// Large, consistent corner radii -- pills for buttons/chips/inputs, big
// rounded rects for cards -- is one of the most visible parts of the
// "modern" look; centralized here so nothing free-hands its own radius.
export const Radii = {
  pill: 999,
  card: 24,
  input: 18,
  badge: 16,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
