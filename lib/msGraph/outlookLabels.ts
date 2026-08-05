// lib/msGraph/outlookLabels.ts
// Next.js-side Graph label (folder + category) helpers, used by the
// origination route (app/api/outlook/assign) to apply a label to the
// acting user's own message synchronously. The async propagation to
// teammates reuses this same logic but duplicated into
// supabase/functions/outlook-label-sync-processor, since Deno edge
// functions can't import Next.js lib/ code (same constraint documented in
// lib/msGraph/onedrive.ts and lib/msGraph/getAccessToken.ts).
import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const CATEGORY_COLOR = "preset9";

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function getOrCreateMailFolder(token: string, folderName: string): Promise<string> {
  const listRes = await fetch(`${GRAPH_BASE}/me/mailFolders?$top=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok) {
    const data = await listRes.json();
    const found = (data.value || []).find((f: any) => f.displayName === folderName);
    if (found) return found.id;
  }
  const createRes = await fetch(`${GRAPH_BASE}/me/mailFolders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: folderName }),
  });
  if (!createRes.ok) throw new Error(`Failed to create mail folder "${folderName}": ${await createRes.text()}`);
  const created = await createRes.json();
  return created.id;
}

export async function getOrCreateCategory(token: string, categoryName: string): Promise<void> {
  const listRes = await fetch(`${GRAPH_BASE}/me/outlook/masterCategories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok) {
    const data = await listRes.json();
    if ((data.value || []).some((c: any) => c.displayName === categoryName)) return;
  }
  const createRes = await fetch(`${GRAPH_BASE}/me/outlook/masterCategories`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: categoryName, color: CATEGORY_COLOR }),
  });
  if (!createRes.ok) throw new Error(`Failed to create category "${categoryName}": ${await createRes.text()}`);
}

export interface GraphMessageInfo {
  id: string;
  internetMessageId: string;
  conversationId: string | null;
  categories: string[];
}

export async function getMessage(token: string, messageId: string): Promise<GraphMessageInfo> {
  const res = await fetch(
    `${GRAPH_BASE}/me/messages/${messageId}?$select=id,internetMessageId,conversationId,categories`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch message: ${await res.text()}`);
  const msg = await res.json();
  return {
    id: msg.id,
    internetMessageId: msg.internetMessageId,
    conversationId: msg.conversationId || null,
    categories: msg.categories || [],
  };
}

// Applies the category, then moves into folderId. Graph mints a NEW id on
// move -- callers must use the returned id for anything downstream.
export async function applyCategoryAndMove(
  token: string, messageId: string, existingCategories: string[], categoryName: string, folderId: string
): Promise<string> {
  if (!existingCategories.includes(categoryName)) {
    const patchRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ categories: [...existingCategories, categoryName] }),
    });
    if (!patchRes.ok) throw new Error(`Failed to apply category: ${await patchRes.text()}`);
  }
  const moveRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}/move`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ destinationId: folderId }),
  });
  if (!moveRes.ok) return messageId; // already in the target folder -- category is still applied
  const moved = await moveRes.json();
  return moved.id || messageId;
}

export async function removeCategory(
  token: string, messageId: string, existingCategories: string[], categoryName: string
): Promise<void> {
  if (!existingCategories.includes(categoryName)) return;
  const res = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ categories: existingCategories.filter(c => c !== categoryName) }),
  });
  if (!res.ok) throw new Error(`Failed to remove category: ${await res.text()}`);
}

// Same collision-check algorithm as the Gmail edge function's
// generateUniqueLabelCode, pointed at project_outlook_labels instead of
// project_gmail_labels.
export async function generateUniqueOutlookLabelCode(supabase: SupabaseClient, companyId: string): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];

    const { data: collision } = await supabase
      .from("project_outlook_labels")
      .select("id, project:project_id(deleted_at)")
      .eq("company_id", companyId)
      .eq("label_code", code)
      .maybeSingle();

    const collidesWithLiveProject = collision && !(collision as any).project?.deleted_at;
    if (!collidesWithLiveProject) return code;
  }
  return "Z" + Date.now().toString(36).slice(-4).toUpperCase();
}
