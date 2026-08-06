# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Stay in sync with the web app

This app mirrors a subset of `../` (the Next.js dashboard) against the same Supabase project and the same API routes, reached over Bearer-token auth instead of cookies (see `src/lib/api.ts`). When the web app's auth flow, schema/RPCs, or a feature this app implements natively (see README's "What's built") changes, update this app in the same change rather than leaving it stale -- see the root `AGENTS.md`'s "Keep the mobile app in sync" section.

# Native modules require a dev-client build, not Expo Go

This app uses native modules Expo Go doesn't ship (`expo-glass-effect`, `react-native-reanimated`/`react-native-worklets`) -- Expo Go crashes on launch (a native segfault in Hermes/worklets). Use `npm run ios` / `npm run android` (`expo run:ios` / `expo run:android`), which build and install a real dev client, not `expo start`.

If a fresh `expo run:ios` fails compiling `expo-modules-jsi` with a Swift "ambiguous without a type annotation" error on `abs(...)`, that's a real Xcode 26.3/Swift toolchain incompatibility with that package's pinned version, patched via `patches/expo-modules-jsi+*.patch` (`patch-package`, runs on `postinstall`). If the patch stops applying after a dependency bump, re-diagnose and regenerate it rather than deleting it.

If `expo run:ios` fails codesigning an embedded framework with "resource fork, Finder information, or similar detritus not allowed," the project directory is inside an iCloud-synced folder tagging build output with Finder metadata; exclude the offending directory from iCloud with `xattr -w com.apple.fileprovider.ignore#P 1 <dir>` rather than moving the project.
