// mobile/src/lib/webHandoff.ts
// Opens a web URL already signed in, instead of the bare
// WebBrowser.openBrowserAsync(`${APP_URL}${path}`) every "open on web"
// surface used to call directly -- see app/api/auth/mobile-handoff/route.ts
// (mint) and app/auth/mobile-handoff/route.ts (redeem) on the web side for
// the full design. Falls back to the old bare-URL behavior on ANY failure
// (network error, expired session, mint route error) -- "open on web" must
// never become less reliable than it already was; worst case the user just
// has to log in once, same as before this existed.
import * as WebBrowser from 'expo-web-browser';
import { APP_URL } from './config';
import { callApi } from './api';

export async function openOnWeb(path: string): Promise<void> {
  try {
    const res = await callApi('/api/auth/mobile-handoff', {
      method: 'POST',
      body: JSON.stringify({ redirectPath: path }),
    });
    if (!res.ok) throw new Error(`mint failed: ${res.status}`);
    const { url } = await res.json();
    if (typeof url !== 'string' || !url) throw new Error('mint returned no url');
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await WebBrowser.openBrowserAsync(`${APP_URL}${path}`);
  }
}
