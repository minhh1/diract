// extension/src/background.js
// MV3 service worker: tracks the active tab (domain + title only, never
// full URLs or page content), buffers closed segments, and periodically
// syncs them to Diract (see app/api/time-tracking/sync/route.ts). Session
// comes from a one-time handoff via onMessageExternal (see
// app/(app)/dashboard/settings/extension/page.tsx) -- from then on this
// keeps its own independent, auto-refreshing session, same shape
// mobile/src/lib/supabase.ts uses (its own supabase-js client,
// chrome.storage.local in place of expo-secure-store).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://txzzgtwrrokomiphairy.supabase.co";
// Replaced at build time via esbuild --define (see package.json's build
// script and README) -- the anon key is public/safe to ship in a bundled
// extension (same key the web app's own client-side bundle already
// exposes), just not hardcoded in source control.
const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;
const APP_URL = "https://diract.io";
const SYNC_ALARM = "diract-time-tracking-sync";
const SYNC_PERIOD_MINUTES = 5;
// Segments shorter than this are almost always accidental tab flicking, not
// real work -- dropped before ever being buffered rather than synced and
// left for a human to notice and ignore during review.
const MIN_SEGMENT_MS = 5000;

// A plain object-backed storage adapter over chrome.storage.local -- the
// same role expo-secure-store plays for mobile. chrome.storage.local
// persists across service-worker restarts (unlike an in-memory Map), which
// matters here since MV3 can suspend/kill this worker at any time between
// events.
const chromeStorageAdapter = {
  getItem: async (key) => (await chrome.storage.local.get(key))[key] ?? null,
  setItem: async (key, value) => chrome.storage.local.set({ [key]: value }),
  removeItem: async (key) => chrome.storage.local.remove(key),
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: chromeStorageAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

async function getSettings() {
  const { trackingEnabled, excludedDomains } = await chrome.storage.local.get(["trackingEnabled", "excludedDomains"]);
  return { trackingEnabled: !!trackingEnabled, excludedDomains: Array.isArray(excludedDomains) ? excludedDomains : [] };
}

function domainFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null; // skip chrome://, about:, extension pages, etc.
    return u.hostname;
  } catch {
    return null;
  }
}

async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url) return null;
  const domain = domainFromUrl(tab.url);
  if (!domain) return null;
  return { domain, title: tab.title || null };
}

// Ends whatever segment is currently open (buffering it, unless it's below
// the noise floor or on an excluded domain) and optionally starts a new one
// -- the one state transition every tab/window/idle listener below funnels
// through, so "close the old one before opening a new one" can never be
// forgotten in one call site but not another.
async function transitionSegment(newInfo) {
  const { currentSegment } = await chrome.storage.local.get("currentSegment");
  if (currentSegment) {
    const endedAt = Date.now();
    const duration = endedAt - currentSegment.startedAt;
    const { excludedDomains } = await getSettings();
    const isExcluded = excludedDomains.some((d) => currentSegment.domain === d || currentSegment.domain.endsWith(`.${d}`));
    if (duration >= MIN_SEGMENT_MS && !isExcluded) {
      const { bufferedSegments } = await chrome.storage.local.get("bufferedSegments");
      const buffer = Array.isArray(bufferedSegments) ? bufferedSegments : [];
      buffer.push({
        domain: currentSegment.domain,
        title: currentSegment.title,
        startedAt: new Date(currentSegment.startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
      });
      await chrome.storage.local.set({ bufferedSegments: buffer });
    }
  }

  const { trackingEnabled } = await getSettings();
  if (newInfo && trackingEnabled) {
    await chrome.storage.local.set({ currentSegment: { domain: newInfo.domain, title: newInfo.title, startedAt: Date.now() } });
  } else {
    await chrome.storage.local.remove("currentSegment");
  }
}

async function onActiveTabMayHaveChanged() {
  const { trackingEnabled } = await getSettings();
  if (!trackingEnabled) { await transitionSegment(null); return; }
  const idleState = await chrome.idle.queryState(60);
  if (idleState !== "active") { await transitionSegment(null); return; }
  const info = await getActiveTabInfo();
  await transitionSegment(info);
}

chrome.tabs.onActivated.addListener(() => { onActiveTabMayHaveChanged(); });
chrome.tabs.onUpdated.addListener((_id, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.title)) onActiveTabMayHaveChanged();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) { transitionSegment(null); return; }
  onActiveTabMayHaveChanged();
});
chrome.idle.setDetectionInterval(120);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "active") onActiveTabMayHaveChanged();
  else transitionSegment(null); // idle/locked -- stop counting time nobody's actually spending
});

// chrome.alarms, not setInterval -- an MV3 service worker can be suspended
// between events, and setInterval doesn't survive that; alarms are the
// platform's own persistent scheduling primitive.
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncBufferedSegments();
});

async function syncBufferedSegments() {
  const { bufferedSegments } = await chrome.storage.local.get("bufferedSegments");
  const segments = Array.isArray(bufferedSegments) ? bufferedSegments : [];
  if (!segments.length) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // not connected yet -- leave buffered, retried next alarm

  try {
    const res = await fetch(`${APP_URL}/api/time-tracking/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ segments }),
    });
    if (res.ok) await chrome.storage.local.set({ bufferedSegments: [] });
    // Non-OK (e.g. the company hasn't enabled time tracking, or a transient
    // error) -- leave the buffer in place, retried on the next alarm rather
    // than dropping real tracked activity.
  } catch {
    // Network error -- same "leave it buffered, retry next alarm" handling.
  }
}

// Internal messages from popup.js (same extension, not externally_connectable
// -- runtime.onMessage, not onMessageExternal) -- "sync now" and connection
// status, so the popup doesn't need its own supabase client just to answer
// "are we connected."
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "sync_now") { syncBufferedSegments().then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === "get_status") {
    supabase.auth.getSession().then(({ data: { session } }) => sendResponse({ connected: !!session }));
    return true;
  }
  return false;
});

// One-time session handoff from app/(app)/dashboard/settings/extension/page.tsx
// -- only a page matching manifest.json's externally_connectable.matches
// can reach this listener at all (browser-enforced), so sender.origin is a
// second, defense-in-depth check rather than the only one.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!sender.url?.startsWith(APP_URL)) { sendResponse({ ok: false, error: "unauthorized origin" }); return; }

  if (message?.type === "ping") { sendResponse({ ok: true }); return; }

  if (message?.type === "diract_connect") {
    supabase.auth.setSession({ access_token: message.accessToken, refresh_token: message.refreshToken })
      .then(({ error }) => sendResponse(error ? { ok: false, error: error.message } : { ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keeps the message channel open for the async response above
  }

  sendResponse({ ok: false, error: "unknown message type" });
});
