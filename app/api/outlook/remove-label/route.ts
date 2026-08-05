// app/api/outlook/remove-label/route.ts
// Mirrors app/api/gmail/remove-label/route.ts's admin-vs-member semantics,
// but propagation to other members goes through the same async
// outlook_sync_jobs engine used by assign -- not an inline per-member loop
// -- since outlook-label-sync-processor already knows how to strip a
// category from every known copy once a label's removed_at is set
// (the isRemoved path).
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getOutlookAccessToken } from "@/lib/msGraph/getAccessToken";
import { getMessage, removeCategory } from "@/lib/msGraph/outlookLabels";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messageId } = body;
  if (!messageId) return NextResponse.json({ error: "Missing messageId" }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles").select("active_company_id").eq("id", user.id).single();
    const companyId = prof?.active_company_id;
    if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

    const { data: pe } = await supabase
      .from("project_outlook_emails")
      .select("project_id")
      .eq("outlook_message_id", messageId).eq("user_id", user.id)
      .maybeSingle();
    if (!pe?.project_id) {
      return NextResponse.json({ error: "This message is not assigned to any project" }, { status: 400 });
    }
    const projectId = pe.project_id;

    const { data: label } = await supabase
      .from("project_outlook_labels")
      .select("category_name").eq("project_id", projectId).eq("company_id", companyId).single();
    if (!label?.category_name) {
      return NextResponse.json({ error: "No label found for this project" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("company_memberships").select("role")
      .eq("user_id", user.id).eq("company_id", companyId).single();
    const isAdmin = membership?.role === "company_admin";

    // Strip the category from the acting user's own copy
    const accessToken = await getOutlookAccessToken(supabase, user.id);
    const message = await getMessage(accessToken, messageId);
    await removeCategory(accessToken, messageId, message.categories, label.category_name);

    if (isAdmin) {
      await supabase.from("project_outlook_emails")
        .delete().eq("project_id", projectId).eq("company_id", companyId);

      await supabase.from("project_outlook_labels")
        .update({ removed_at: new Date().toISOString() })
        .eq("project_id", projectId).eq("company_id", companyId);

      const { data: members } = await supabase
        .from("company_memberships").select("user_id").eq("company_id", companyId);
      const memberIds = (members || []).map((m: any) => m.user_id);
      const { data: connected } = memberIds.length
        ? await supabase.from("user_outlook_tokens").select("user_id").in("user_id", memberIds)
        : { data: [] as any[] };
      const totalUsers = (connected || []).length;

      if (totalUsers > 0) {
        const { data: existingJob } = await supabase
          .from("outlook_sync_jobs")
          .select("id")
          .eq("job_type", "label_sync").eq("company_id", companyId).eq("project_id", projectId)
          .maybeSingle();

        if (existingJob) {
          await supabase.from("outlook_sync_jobs").update({
            status: "pending", attempts: 0, error: null,
            completed_users: [user.id], total_users: totalUsers, is_realtime: true,
            updated_at: new Date().toISOString(),
          }).eq("id", existingJob.id);
        } else {
          await supabase.from("outlook_sync_jobs").insert({
            job_type: "label_sync", company_id: companyId, project_id: projectId,
            category_name: label.category_name, status: "pending", attempts: 0,
            completed_users: [user.id], total_users: totalUsers, is_realtime: true,
          });
        }
      }
    } else {
      await supabase.from("project_outlook_emails")
        .delete().eq("outlook_message_id", messageId).eq("user_id", user.id);
    }

    await supabase.from("outlook_sync_log").insert({
      company_id: companyId, triggered_by: user.id, action: "label_removed",
      project_id: projectId, outlook_message_id: messageId, category_name: label.category_name,
      target_user_id: user.id, details: { isAdminAction: isAdmin },
    });

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error("[outlook/remove-label] Unhandled error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
