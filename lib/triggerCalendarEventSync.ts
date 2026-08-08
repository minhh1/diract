// lib/triggerCalendarEventSync.ts
// Fire-and-forget call to the calendar-event-sync edge function, same shape
// as lib/triggerCalendarSync.ts (the existing task->calendar push) -- kept
// as its own function/edge-function pair rather than folded into that one,
// since a calendar_events row and a task are different enough shapes
// (title-format tokens, dual assignee/company sync targets) that sharing
// one handler would mean branching on which id was passed throughout.
export function triggerCalendarEventSync(eventId: string, action: "upsert" | "cancel"): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  fetch(`${supabaseUrl}/functions/v1/calendar-event-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ action, eventId }),
  }).catch(err => console.error("[calendar-event-sync] trigger failed:", err?.message));
}
