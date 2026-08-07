# Diract time-tracking extension (phase 1)

Manifest V3 Chrome/Edge extension. Passively tracks the active tab's
**domain and page title only** (never full URLs, query strings, page
content, or screenshots), buffers it locally, and syncs it to Diract every
~5 minutes. Synced activity is folded into the existing Auto Time Recording
drafting pipeline (`app/api/time-entries/auto-generate`) as a third source
alongside completed tasks and matter-linked emails -- see the root repo's
plan doc for the full design.

## Setup

1. `npm install`
2. Build with the project's anon key injected:
   ```
   SUPABASE_ANON_KEY=<the same NEXT_PUBLIC_SUPABASE_ANON_KEY the web app uses> npm run build
   ```
   This produces `background.js` and `popup.js` at the extension root
   (gitignored build output, not the TypeScript-free source in `src/`).
3. **Generate a fixed extension key** so the extension's ID stays stable
   across every install/reload during development (Chrome otherwise
   regenerates a new random ID each time you load an unpacked build, which
   breaks `app/(app)/dashboard/settings/extension/page.tsx`'s hardcoded
   `NEXT_PUBLIC_TIME_TRACKING_EXTENSION_ID` target):
   - Load the extension unpacked once (`chrome://extensions` → Developer
     mode → Load unpacked → select this `extension/` directory).
   - Chrome writes a generated keypair you can extract, or generate one
     yourself (`openssl genrsa 2048 | openssl rsa -pubout -outform DER | openssl base64 -A`)
     and add it to `manifest.json` as `"key": "<that base64 string>"`.
   - Reload the extension -- its ID (shown on `chrome://extensions`) is now
     fixed. Set `NEXT_PUBLIC_TIME_TRACKING_EXTENSION_ID` in the web app's
     env to that ID.
4. Once published to the Chrome Web Store, replace the placeholder
   `CHROME_WEB_STORE_URL` in the connect page with the real listing URL.

## Files

- `manifest.json` -- permissions, `externally_connectable` (only
  `https://diract.io` may message this extension), the background service
  worker registration.
- `src/background.js` -- all the actual logic: tab/idle tracking, local
  buffering, periodic sync, and the one-time session handoff listener.
- `popup.html` / `src/popup.js` -- connection status, the tracking on/off
  toggle, and the excluded-domains list. All settings are local
  (`chrome.storage.local`), read/written directly by the popup.

## Privacy by construction

- Only `domain` + `title` ever leave the device -- see
  `background.js`'s `getActiveTabInfo`/`transitionSegment`.
- An excluded-domains list (popup) is checked *before* a segment is ever
  buffered -- excluded activity is never even queued, let alone synced.
- Tracking defaults to off (`trackingEnabled` unset) even once connected,
  and requires a company admin to have turned the feature on at all
  (`time_tracking_settings.enabled`, checked server-side on every sync).
