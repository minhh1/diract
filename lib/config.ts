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
// only once an actual feature needs that data.
export const XERO_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'accounting.settings.read',
].join(' ');