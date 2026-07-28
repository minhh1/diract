import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

// Supabase's own storage-adapter shape, backed by the iOS Keychain / Android
// Keystore instead of AsyncStorage -- sessions are small (a JWT pair), well
// under Keychain's practical size limits, so no extra chunking/encryption
// layer is needed.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// expo-secure-store has no real web/Node implementation -- calling it from
// Expo Router's web target (which server-renders this module in Node,
// before any browser exists) throws immediately ("getValueWithKeyAsync is
// not a function"), crashing the whole app. Native platforms keep the
// Keychain/Keystore adapter; leaving `storage` undefined on web falls back
// to supabase-js's own default, which already guards for SSR (no
// `window`/`localStorage`) and only touches the browser's localStorage
// once one actually exists.
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's token auto-refresh timer only ticks while JS is running; a
// backgrounded app can miss a refresh and come back with an expired
// session, so kick it explicitly on every foreground transition.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
