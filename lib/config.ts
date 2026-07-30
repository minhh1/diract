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
// app.connections is the one entry from that portal list we actually need
// (and must tick there) -- it's what lets callback/route.ts and
// connections/route.ts call GET/DELETE https://api.xero.com/connections to
// enumerate/revoke which organisation(s) were authorized.
export const XERO_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'app.connections',
  'accounting.settings.read',
].join(' ');