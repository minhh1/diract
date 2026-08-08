// The fixed list of app events that can notify a user -- in-app, email, or
// push (see supabase/migrations/20260729460000_create_notification_rpc.sql).
// Shared by every UI that renders "which events, which channels":
// components/admin/AdminEmailTab.tsx (per-company email on/off, existing)
// and the per-user preferences card on app/dashboard/profile/page.tsx (new).
// One list means the two can never drift apart on which keys exist.
//
// Moved from lib/email/eventTypes.ts, which only ever covered the email
// channel and the 3 events that existed before this notification system.
export interface NotificationEventType {
  key: string;
  label: string;
  description: string;
}

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  {
    key: "task_assigned",
    label: "Task assigned",
    description: "A task is assigned to you.",
  },
  {
    key: "archive_request_approved",
    label: "Archive request approved",
    description: "An archive request you submitted is approved.",
  },
  {
    key: "archive_request_rejected",
    label: "Archive request rejected",
    description: "An archive request you submitted is rejected.",
  },
  {
    key: "archive_request_submitted",
    label: "Archive request submitted",
    description: "A team member submits a new archive request that needs review. (Admins only.)",
  },
  {
    key: "team_member_joined",
    label: "Team member joined",
    description: "Someone accepts an invite and joins your company. (Admins only.)",
  },
  {
    key: "gmail_needs_review",
    label: "Gmail item needs review",
    description: "The Gmail add-on creates a record it isn't confident is a correct match. (Admins only.)",
  },
  {
    key: "task_comment",
    label: "Task activity",
    description: "An update is added to a task you're watching.",
  },
  {
    key: "irregularity_detected",
    label: "Irregularity detected",
    description: "An automated rule flags an issue on a record (e.g. an invalid TFN). (Admins only.)",
  },
  {
    key: "matter_created",
    label: "New matter created",
    description: "A new project/matter is created. (Admins only.)",
  },
  {
    key: "gmail_label_created",
    label: "Gmail label created",
    description: "A matter's organizational label is set up in your connected Gmail account.",
  },
  {
    key: "gmail_sync_failure",
    label: "Gmail sync failure",
    description: "Your connected Gmail account loses sync and needs reconnecting.",
  },
  {
    key: "lead_email_assignment_submitted",
    label: "Lead email needs review",
    description: "A new email in the shared Leads inbox is proposed for assignment to a Lead and needs approval. (Admins only.)",
  },
  {
    key: "property_link_request_submitted",
    label: "Property link request",
    description: "A matter's name looks like a property address and needs approval to link (or create) the matching Property. (Admins only.)",
  },
  {
    key: "calendar_date_due",
    label: "Calendar reminder",
    description: "A date you've added to the calendar (e.g. a task's due date) arrives.",
  },
  {
    key: "message_mentioned",
    label: "Mentioned in a message",
    description: "Someone @mentions you in a channel or DM.",
  },
  {
    key: "message_dm",
    label: "Direct message",
    description: "Someone sends you a direct message.",
  },
];
