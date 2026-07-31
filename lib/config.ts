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

// Widened for the Finance Model feature (see components/dashboard/tabs/
// FinanceModelTab.tsx) -- invoices/bank transactions/budgets/P&L give
// actual-vs-budgeted income and expenses per connected organisation;
// contacts.read resolves payee/payer names for the spreadsheet view.
// offline_access/openid/profile are universal OAuth/OIDC scopes -- they
// don't appear as checkboxes in the Xero developer portal's (new, as of
// March 2026) granular scopes list, which only covers resource-level API
// access; they're requested directly here regardless of which granular
// scopes the portal has configured. Every scope below was individually
// and jointly verified by hitting https://login.xero.com/identity/connect/
// authorize directly (bypassing the browser) before adding -- see the
// app.connections lesson below.
//
// Deliberately does NOT include 'app.connections', despite it being listed
// in the portal's scope reference -- confirmed by directly hitting
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
//
// NOTE: widening this requires every already-connected organisation to be
// reconnected (Xero access tokens are scoped to what was originally
// consented -- an existing connection's token won't retroactively gain
// access to invoices/banktransactions/etc just because the code now asks
// for them).
export const XERO_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'accounting.settings.read',
  'accounting.contacts.read',
  'accounting.invoices.read',
  'accounting.banktransactions.read',
  'accounting.budgets.read',
  'accounting.reports.profitandloss.read',
].join(' ');