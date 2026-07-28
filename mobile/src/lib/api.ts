import { APP_URL } from './config';
import { supabase } from './supabase';

// Calls a Next.js API route on the web app with the mobile session's access
// token as `Authorization: Bearer <token>` -- the counterpart to the
// cookie-based session the web app sends automatically. Works against any
// route built on createSupabaseServerClient() (see ../../../lib/supabaseServer.ts),
// which is most of app/api/**.
export async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');

  return fetch(`${APP_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}
