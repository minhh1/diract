// app/api/outlook/messages/[id]/route.ts
// Mirrors app/api/gmail/messages/[id]/route.ts — fetch one message's body.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getOutlookAccessToken } from "@/lib/msGraph/getAccessToken";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let accessToken: string;
    try {
      accessToken = await getOutlookAccessToken(supabase, user.id);
    } catch {
      return NextResponse.json({ error: "Outlook not connected" }, { status: 400 });
    }

    const res = await fetch(
      `${GRAPH_BASE}/me/messages/${id}?$select=id,subject,body,categories`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.error?.message || "Failed to fetch message" }, { status: res.status });
    }
    const msg = await res.json();

    return NextResponse.json({
      body: msg.body?.content || "",
      categories: msg.categories || [],
    });

  } catch (err: any) {
    console.error("[outlook/messages/id] Error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
