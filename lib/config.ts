// lib/config.ts
export const APP_URL = 
  process.env.NEXT_PUBLIC_APP_URL ?? 
  'https://diract.io';

export const GMAIL_REDIRECT_URI = `${APP_URL}/api/gmail/callback`;

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT ?? 'common';

export const OUTLOOK_REDIRECT_URI = `${APP_URL}/api/outlook/callback`;

export const OUTLOOK_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'MailboxSettings.Read',
].join(' ');

export const XERO_REDIRECT_URI = `${APP_URL}/api/xero/callback`;

// Read-only for now (see supabase/migrations/20260729170000_xero_connections.sql) --
// just enough to show connection status and organisation/settings info.
// Widen this (e.g. accounting.transactions.read, accounting.contacts.read)
// only once an actual feature needs that data. offline_access/openid/profile
// are universal OAuth/OIDC scopes -- they don't appear as checkboxes in the
// Xero developer portal's (new, as of March 2026) granular scopes list,
// which only covers resource-level API access; they're requested directly
// here regardless of which granular scopes the portal has configured.
//
// Deliberately does NOT include 'app.connections', despite it being listed
// in that portal's scope reference -- confirmed by directly hitting
// https://login.xero.com/identity/connect/authorize with different scope
// combinations (bypassing the browser) that requesting it, alone or
// combined with anything else, gets an immediate
// `access_denied: Requested wrong apps scopes` response before Xero even
// shows a login screen -- reproduced on two separately-registered apps, so
// it isn't an app-specific provisioning issue. GET/DELETE
// https://api.xero.com/connections (callback/route.ts, connections/route.ts)
// works fine on a token issued from the scopes below alone -- Xero doesn't
// actually gate that endpoint behind app.connections despite what the
// scope's name implies.
export const XERO_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'accounting.settings.read',
].join(' ');