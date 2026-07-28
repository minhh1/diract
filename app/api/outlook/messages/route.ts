// app/api/outlook/messages/route.ts
// Mirrors app/api/gmail/messages/route.ts's shape — list the inbox,
// cross-referenced against project_outlook_emails for assignment state.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getOutlookAccessToken } from "@/lib/msGraph/getAccessToken";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function GET(req: NextRequest) {
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

    const { data: projectEmails } = await supabase
      .from("project_outlook_emails")
      .select("outlook_message_id, project_id, project:project_id(name)")
      .eq("user_id", user.id);

    const emailProjectMap = new Map<string, { projectId: string; labelName: string }>();
    (projectEmails || []).forEach((pe: any) => {
      emailProjectMap.set(pe.outlook_message_id, {
        projectId: pe.project_id,
        labelName: pe.project?.name || pe.project_id,
      });
    });

    const { searchParams } = new URL(req.url);
    const top = searchParams.get("top") || "50";

    const listRes = await fetch(
      `${GRAPH_BASE}/me/mailFolders('inbox')/messages?$top=${top}&$select=id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,categories`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      const err = await listRes.json();
      return NextResponse.json(
        { error: err.error?.message || "Failed to fetch messages" },
        { status: listRes.status }
      );
    }

    const listData = await listRes.json();
    const messages = (listData.value || []).map((msg: any) => {
      const assignment = emailProjectMap.get(msg.id);
      return {
        id: msg.id,
        subject: msg.subject || "(no subject)",
        from: msg.from?.emailAddress?.address || "",
        fromName: msg.from?.emailAddress?.name || "",
        date: msg.receivedDateTime,
        snippet: msg.bodyPreview || "",
        isRead: !!msg.isRead,
        hasAttachments: !!msg.hasAttachments,
        categories: msg.categories || [],
        diractLabels: assignment ? [assignment.labelName] : [],
        diractProjectIds: assignment ? [assignment.projectId] : [],
      };
    });

    return NextResponse.json({ messages });

  } catch (err: any) {
    console.error("[outlook/messages] Error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
