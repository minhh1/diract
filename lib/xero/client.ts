// lib/xero/client.ts
// Xero Accounting API client. Mirrors lib/gmail/client.ts's token-refresh
// shape, with one key difference: Xero rotates the refresh_token on every
// refresh call (the old one is invalidated), so the new refresh_token must
// be persisted every time or the connection breaks on the next refresh.

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

async function refreshAccessToken(connectionId: string, supabase: any): Promise<string> {
  const { data: connection } = await supabase
    .from('company_xero_connections')
    .select('access_token, refresh_token, token_expires_at, tenant_id')
    .eq('id', connectionId)
    .single();

  if (!connection) throw new Error('Xero connection not found');

  const expiresAt = new Date(connection.token_expires_at).getTime();
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000;

  if (!needsRefresh) return connection.access_token;

  const basicAuth = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  });
  const refreshed = await res.json();

  if (refreshed.error) {
    await supabase
      .from('company_xero_connections')
      .update({ last_sync_error: refreshed.error_description || refreshed.error })
      .eq('id', connectionId);
    throw new Error(`Xero token refresh failed: ${refreshed.error}`);
  }

  await supabase
    .from('company_xero_connections')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      last_sync_error: null,
    })
    .eq('id', connectionId);

  return refreshed.access_token;
}

// Calls the Xero Accounting API for a single connected organisation,
// refreshing the access token first if it's close to expiry.
export async function xeroApiFetch(
  connectionId: string,
  supabase: any,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { data: connection } = await supabase
    .from('company_xero_connections')
    .select('tenant_id')
    .eq('id', connectionId)
    .single();
  if (!connection) throw new Error('Xero connection not found');

  const token = await refreshAccessToken(connectionId, supabase);

  return fetch(`${XERO_API_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': connection.tenant_id,
      Accept: 'application/json',
    },
  });
}
