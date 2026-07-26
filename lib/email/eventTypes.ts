// The fixed list of app events that can send a notification email. Shared
// between AdminEmailTab.tsx (renders one toggle per entry, writing into
// companies.email_notification_settings) and every call site of notifyEvent
// (lib/email/notify.ts), so the key never drifts between the two.
export interface EmailEventType {
  key: string;
  label: string;
  description: string;
}

export const EMAIL_EVENT_TYPES: EmailEventType[] = [
  {
    key: "task_assigned",
    label: "Task assigned",
    description: "Email a user when a task is assigned to them.",
  },
  {
    key: "archive_request_approved",
    label: "Archive request approved",
    description: "Email the requester when their archive request is approved.",
  },
  {
    key: "archive_request_rejected",
    label: "Archive request rejected",
    description: "Email the requester when their archive request is rejected.",
  },
];
