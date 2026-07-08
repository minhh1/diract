// app/api/gmail/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tokenRow } = await supabase
      .from('user_gmail_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (!tokenRow) return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });

    // Refresh token if needed
    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.token_expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        accessToken = refreshed.access_token;
        await supabase.from('user_gmail_tokens').update({
          access_token: refreshed.access_token,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('user_id', user.id);
      }
    }

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gmail fetch body error:', res.status, errText);
      return NextResponse.json({ error: `Gmail API error: ${res.status}`, body: null });
    }

    const msg = await res.json();

    // Extract body — inline here to avoid Buffer issues
    const extractBody = (payload: any): string => {
      if (!payload) return '';
      if (payload.body?.data) {
        try {
          const base64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
          return atob(base64);
        } catch { return ''; }
      }
      if (payload.parts?.length) {
        const html = payload.parts.find((p: any) => p.mimeType === 'text/html');
        const text = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        const part = html || text;
        if (part?.body?.data) {
          try {
            const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
            return atob(base64);
          } catch { return ''; }
        }
        for (const p of payload.parts) {
          const body = extractBody(p);
          if (body) return body;
        }
      }
      return '';
    };

    const body = extractBody(msg.payload);
    const labelIds = msg.labelIds || [];

    return NextResponse.json({ body, labelIds });

  } catch (err: any) {
    console.error('getMessage error:', err);
    return NextResponse.json({ error: err.message, body: null });
  }
}