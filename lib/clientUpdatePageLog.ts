// lib/clientUpdatePageLog.ts
// Activity log for Client Update Pages -- one human-readable row per
// meaningful change (value edit, matter added/removed, group created/
// renamed/deleted, column added/removed, PIN changed), rather than
// structured per-field-type data, so it never needs bespoke rendering
// logic to display (see client_update_page_logs in the migration).
// actor_name is a plain text snapshot, not a profile FK, so a log entry
// stays readable even after the staff member's account is removed.
export async function logChange(
  admin: any, pageId: string, actorName: string | null, source: "staff" | "client", action: string, detail: string
) {
  await admin.from("client_update_page_logs").insert({ page_id: pageId, actor_name: actorName, source, action, detail });
}

// Best-effort display name for the signed-in caller -- full_name first,
// falling back to their email, same convention as the staff notes route.
export async function resolveActorName(admin: any, userId: string): Promise<string | null> {
  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return profile?.full_name || profile?.email || null;
}
