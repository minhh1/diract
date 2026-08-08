// lib/ai/dataAccessGrant.ts
// Company-wide "has this company consented to an AI feature reading real
// business data" grant -- extracted out of lib/ai/tableBuilderTools.ts
// (originally private to the table/dashboard-builder chat's own
// query_records tool) so a second AI feature (lib/ai/pageBuilderTools.ts's
// record-linking tools) can check/request the exact same consent instead of
// inventing a parallel flow. Deliberately company-wide, not feature-scoped:
// a company that's already agreed the AI can read their business data for
// one feature has agreed to it for another, same trust boundary either way.
//
// Return type is HostedToolExecutionResult (lib/ai/modelCall.ts), not a
// locally-declared one -- that's the actual shared/neutral shape both
// tableBuilderTools.ts's own ToolExecutionResult and pageBuilderTools.ts
// already satisfy structurally, avoiding a circular import between the two
// tool files.
import type { HostedToolExecutionResult } from "./modelCall";

export async function hasDataAccessGrant(admin: any, companyId: string): Promise<boolean> {
  const { data } = await admin.from("ai_chat_settings").select("data_access_granted_until").eq("company_id", companyId).maybeSingle();
  if (!data?.data_access_granted_until) return false;
  return new Date(data.data_access_granted_until) > new Date();
}

export async function grantAiDataAccess(admin: any, companyId: string, input: Record<string, any>): Promise<HostedToolExecutionResult> {
  const duration = String(input.duration || "");
  if (duration !== "one_time" && duration !== "30_days") return { content: "duration must be 'one_time' or '30_days'", isError: true };

  // 'one_time' isn't set to an already-past timestamp -- this same tool
  // loop's very next data-reading call (the whole point of calling this)
  // would then immediately find itself unauthorized again. A short window
  // covers the rest of this turn (and any quick follow-up in the same
  // conversation) without leaving standing access open the way 30_days
  // deliberately does.
  const grantedUntil = duration === "30_days"
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 10 * 60 * 1000);

  const { error } = await admin.from("ai_chat_settings").upsert(
    { company_id: companyId, data_access_granted_until: grantedUntil.toISOString() },
    { onConflict: "company_id" }
  );
  if (error) return { content: `Failed to record access grant: ${error.message}`, isError: true };
  return { content: duration === "30_days" ? "Access granted for 30 days." : "Access granted for this conversation." };
}

// Shared, since both AI features' NEEDS_CONSENT replies should read
// identically to a user regardless of which one triggered it.
export const NEEDS_CONSENT_MESSAGE =
  "NEEDS_CONSENT: You do not have permission to read this company's business data yet. Do not retry the read until the user has explicitly agreed. " +
  "In your reply: explain plainly what data you need and why, state clearly that nothing sent to us is retained or used to retrain any model (it's auto-deleted after 90 days, per this app's real privacy policy), " +
  "and ask them to choose between one-time access (just for this conversation) or a standing 30-day grant. Once they reply with their choice, call grant_ai_data_access with that duration, then retry.";
