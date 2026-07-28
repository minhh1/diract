import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

// Mirrors app/auth/callback/route.ts on the web app, but client-side: opens
// Supabase's Google consent screen in an in-app browser, then completes the
// session from whatever the redirect URL comes back with (a PKCE `code` or,
// if the project's flow type ever changes, implicit tokens straight in the
// URL) rather than assuming one shape.
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) return { error: error?.message ?? 'Could not start Google sign-in.' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    return { error: result.type === 'cancel' ? null : 'Google sign-in was not completed.' };
  }

  return completeSessionFromUrl(result.url);
}

async function completeSessionFromUrl(url: string): Promise<{ error: string | null }> {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};

  const code = typeof params.code === 'string' ? params.code : undefined;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error: error?.message ?? null };
  }

  // Implicit-flow fallback: tokens arrive in the URL fragment, which
  // Linking.parse doesn't split out, so pull them out by hand.
  const fragment = url.split('#')[1];
  if (fragment) {
    const fragmentParams = new URLSearchParams(fragment);
    const access_token = fragmentParams.get('access_token');
    const refresh_token = fragmentParams.get('refresh_token');
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      return { error: error?.message ?? null };
    }
  }

  return { error: 'No session information was returned from Google.' };
}
