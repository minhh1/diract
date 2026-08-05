// app/api/outlook/assign/route.ts
// Origination point for the Outlook async label-sync engine — the analog
// of gmail-addon's create-project/import flow (the thing that mints the
// first label copy and kicks enqueueLabelSyncJob off). Applies the
// category + folder to the ACTING user's own message synchronously, then
// inserts one outlook_sync_jobs row so outlook-label-sync-worker propagates
// it to the rest of the team asynchronously — this is deliberately NOT a
// synchronous loop over every teammate (that's the lighter Gmail in-app-
// client pattern the user explicitly said not to replicate).
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getOutlookAccessToken } from "@/lib/msGraph/getAccessToken";
import {
  getOrCreateMailFolder, getOrCreateCategory, getMessage, applyCategoryAndMove,
  generateUniqueOutlookLabelCode,
} from "@/lib/msGraph/outlookLabels";

async function buildCategoryName(
  supabase: any, companyId: string, projectId: string, projectName: string
): Promise<{ categoryName: string; labelCode: string }> {
  const { data: company } = await supabase
    .from("companies")
    .select("outlook_label_tokens, outlook_sublabel_separator")
    .eq("id", companyId).single();

  const tokens: string[] = company?.outlook_label_tokens?.length ? company.outlook_label_tokens : ["project_name"];
  const separator: string = company?.outlook_sublabel_separator || " — ";

  const { data: cfValues } = await supabase
    .from("company_custom_field_values")
    .select("value_text, field:field_id(label, field_key)")
    .eq("record_id", projectId).eq("table_name", "projects");

  const getCfValue = (keyword: string) => {
    const match = (cfValues || []).find((v: any) =>
      v.field?.label?.toLowerCase().includes(keyword.toLowerCase()) ||
      v.field?.field_key?.toLowerCase().includes(keyword.toLowerCase())
    );
    return match?.value_text || "";
  };

  const parts: string[] = [];
  for (const token of tokens) {
    if (token === "project_name") parts.push(projectName);
    else if (token === "matter_number") parts.push(getCfValue("matter number") || getCfValue("matter_number"));
    else if (token === "year") parts.push(String(new Date().getFullYear()));
  }
  const labelCode = await generateUniqueOutlookLabelCode(supabase, companyId);
  const categoryName = `${parts.filter(Boolean).join(separator)} [${labelCode}]`;
  return { categoryName, labelCode };
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messageId, projectId, subject, from: fromAddr, fromName, date, snippet } = body;
  if (!messageId || !projectId) {
    return NextResponse.json({ error: "Missing messageId or projectId" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles").select("active_company_id").eq("id", user.id).single();
    const companyId = prof?.active_company_id;
    if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

    const { data: project } = await supabase
      .from("projects").select("id, name").eq("id", projectId).single();
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const accessToken = await getOutlookAccessToken(supabase, user.id);

    // ── Resolve or create the project's label ──────────────────────
    const { data: existingLabel } = await supabase
      .from("project_outlook_labels")
      .select("id, category_name, label_code")
      .eq("company_id", companyId).eq("project_id", projectId)
      .is("removed_at", null).maybeSingle();

    let categoryName: string;
    let labelCode: string;
    if (existingLabel) {
      categoryName = existingLabel.category_name;
      labelCode = existingLabel.label_code;
    } else {
      const built = await buildCategoryName(supabase, companyId, projectId, project.name);
      categoryName = built.categoryName;
      labelCode = built.labelCode;
      const { error: insertError } = await supabase.from("project_outlook_labels").insert({
        company_id: companyId, project_id: projectId, category_name: categoryName,
        label_code: labelCode, created_by: user.id,
      });
      if (insertError) {
        return NextResponse.json({ error: `DB error creating label: ${insertError.message}` }, { status: 500 });
      }
    }

    // ── Apply to the acting user's own mailbox ──────────────────────
    const { data: company } = await supabase
      .from("companies").select("outlook_parent_folder").eq("id", companyId).single();
    const folderName = company?.outlook_parent_folder || "Shared Emails";

    // Persist the folder name (and mark the company as Outlook-active) on
    // first use — outlook-label-sync-cron uses outlook_parent_folder being
    // set as its signal for "this company has Outlook labels to sync",
    // mirroring how gmail-label-sync-cron keys off gmail_parent_label.
    if (!company?.outlook_parent_folder) {
      await supabase.from("companies").update({
        outlook_parent_folder: folderName, mail_provider: "outlook",
      }).eq("id", companyId);
    }

    const folderId = await getOrCreateMailFolder(accessToken, folderName);
    await getOrCreateCategory(accessToken, categoryName);

    const message = await getMessage(accessToken, messageId);
    const newMessageId = await applyCategoryAndMove(accessToken, messageId, message.categories, categoryName, folderId);

    const { error: peError } = await supabase.from("project_outlook_emails").upsert({
      user_id: user.id, company_id: companyId, project_id: projectId,
      outlook_message_id: newMessageId, outlook_internet_message_id: message.internetMessageId,
      outlook_conversation_id: message.conversationId,
      categories: [...message.categories, categoryName],
      subject: subject || "(no subject)", from_address: fromAddr || "", from_name: fromName || "",
      date: date || null, snippet: snippet || "",
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,outlook_message_id" });
    if (peError) {
      return NextResponse.json({ error: `DB error saving email: ${peError.message}` }, { status: 500 });
    }

    // ── Enqueue async propagation to the rest of the team ────────────
    // Skipped when Central Email is on for this company -- the acting
    // user's own mailbox is already updated above; everyone else reads the
    // email centrally instead.
    const { data: companyCentralEmail } = await supabase
      .from("companies").select("central_email_enabled").eq("id", companyId).single();
    const centralEmailEnabled = !!companyCentralEmail?.central_email_enabled;

    const { data: members } = await supabase
      .from("company_memberships").select("user_id").eq("company_id", companyId);
    const memberIds = (members || []).map((m: any) => m.user_id);
    const { data: connected } = memberIds.length
      ? await supabase.from("user_outlook_tokens").select("user_id").in("user_id", memberIds)
      : { data: [] as any[] };
    const totalUsers = (connected || []).length;

    if (totalUsers > 0 && !centralEmailEnabled) {
      const { data: existingJob } = await supabase
        .from("outlook_sync_jobs")
        .select("id, status, completed_users")
        .eq("job_type", "label_sync").eq("company_id", companyId).eq("project_id", projectId)
        .maybeSingle();

      if (existingJob && existingJob.status !== "processing") {
        const completed = new Set(existingJob.completed_users || []);
        completed.add(user.id);
        await supabase.from("outlook_sync_jobs").update({
          status: "pending", attempts: 0, error: null,
          completed_users: Array.from(completed), total_users: totalUsers,
          is_realtime: true, updated_at: new Date().toISOString(),
        }).eq("id", existingJob.id);
      } else if (!existingJob) {
        await supabase.from("outlook_sync_jobs").insert({
          job_type: "label_sync", company_id: companyId, project_id: projectId,
          label_code: labelCode, category_name: categoryName, status: "pending",
          attempts: 0, completed_users: [user.id], total_users: totalUsers, is_realtime: true,
        });
      }
    }

    await supabase.from("outlook_sync_log").insert({
      company_id: companyId, triggered_by: user.id, action: "label_applied",
      project_id: projectId, outlook_message_id: newMessageId, category_name: categoryName,
      target_user_id: user.id, details: { subject, syncQueuedForUsers: centralEmailEnabled ? 0 : Math.max(totalUsers - 1, 0) },
    });

    return NextResponse.json({ ok: true, categoryName, labelCode, messageId: newMessageId });

  } catch (err: any) {
    console.error("[outlook/assign] Unhandled error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
