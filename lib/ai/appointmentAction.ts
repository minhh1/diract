// lib/ai/appointmentAction.ts
// Slot-filling state machine for the bot's create_appointment action --
// mirrors lib/ai/fileActions.ts's shape (a smaller sibling to
// lib/ai/actionAdvance.ts's task/project machinery, since an appointment
// has no company-configurable custom fields or per-company required/
// default settings). Always books a fixed 1-hour slot on the firm's
// shared calendar (see lib/ai/calendarBooking.ts) -- no duration field to
// ask about, and no free/busy conflict check (matches how task due-date
// calendar sync already works: create the event, don't gatekeep on
// availability).
import { parseRelativeDate } from "./parseRelativeDate";

export interface AppointmentCollectingResult {
  status: "collecting";
  collected: Record<string, string>;
  missingFields: string[];
  question: string;
}

export interface AppointmentConfirmingResult {
  status: "confirming";
  summary: string;
  params: Record<string, unknown>;
}

export type AppointmentAdvanceResult = AppointmentCollectingResult | AppointmentConfirmingResult;

interface AppointmentField {
  key: string;
  label: string;
  required: boolean;
}

// address vs. notes are two separate optional properties (rather than one
// "location" field) so the model itself decides which one a location
// description belongs in -- a literal street address goes in address, a
// vague/non-specific description (e.g. "at the client's office", "video
// call") goes in notes instead. See the property descriptions in
// lib/ai/actionTools.ts's CREATE_APPOINTMENT_TOOL, which guide that split.
const APPOINTMENT_FIELDS: AppointmentField[] = [
  { key: "name", label: "Appointment title", required: true },
  { key: "date", label: "Date (YYYY-MM-DD)", required: true },
  { key: "start_time", label: "Start time (HH:MM, 24-hour)", required: true },
  { key: "address", label: "Address (optional -- only if there's a specific location)", required: false },
  { key: "notes", label: "Notes (optional)", required: false },
];

function buildQuestion(fields: AppointmentField[], notes: string[]): string {
  const prefix = notes.length ? notes.join(" ") + "\n\n" : "";
  return `${prefix}I need a few more details before I book this:\n${fields.map((f) => `- ${f.label}`).join("\n")}`;
}

// Extraction tool for a reply arriving while a create_appointment is still
// "collecting" -- same shape as buildFileMissingFieldsTool, no opaque
// field_key/label-slug translation needed since these are plain semantic
// keys, not custom fields.
export function buildAppointmentMissingFieldsTool(missingFieldKeys: string[]) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const key of missingFieldKeys) {
    const field = APPOINTMENT_FIELDS.find((f) => f.key === key);
    if (field) properties[key] = { type: "string", description: field.label };
  }
  return [
    {
      type: "function",
      function: {
        name: "provide_details",
        description: "Extract any of the requested details that the user's reply actually answers. Omit any field the reply doesn't address -- never invent or guess a value.",
        parameters: { type: "object", properties, required: [] },
      },
    },
  ];
}

export async function advanceAppointmentAction(collectedIn: Record<string, string>): Promise<AppointmentAdvanceResult> {
  const collected = { ...collectedIn };
  const conflictNotes: string[] = [];

  // Validated the same way lib/ai/actionAdvance.ts validates its "date"/
  // "time" field kinds -- an invalid value is treated the same as a
  // missing one, re-asked together with anything else outstanding.
  if (collected.date?.trim()) {
    const relative = parseRelativeDate(collected.date.trim());
    if (relative) {
      collected.date = relative;
    } else {
      const parsed = Date.parse(collected.date.trim());
      if (Number.isNaN(parsed)) {
        conflictNotes.push(`I couldn't understand the date "${collected.date}" -- please use YYYY-MM-DD.`);
        delete collected.date;
      } else {
        collected.date = new Date(parsed).toISOString().slice(0, 10);
      }
    }
  }
  if (collected.start_time?.trim()) {
    const match = collected.start_time.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
      conflictNotes.push(`I couldn't understand the time "${collected.start_time}" -- please use 24-hour HH:MM (e.g. 14:30).`);
      delete collected.start_time;
    } else {
      collected.start_time = `${match[1].padStart(2, "0")}:${match[2]}`;
    }
  }

  const missing = APPOINTMENT_FIELDS.filter((f) => f.required && !collected[f.key]?.trim());
  if (missing.length) {
    return { status: "collecting", collected, missingFields: missing.map((f) => f.key), question: buildQuestion(missing, conflictNotes) };
  }

  const weekday = new Date(`${collected.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });
  const displayDate = new Date(`${collected.date}T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC" });
  const summaryParts = [`"${collected.name}"`, `${weekday}, ${displayDate} at ${collected.start_time} for 1 hour`];
  if (collected.address?.trim()) summaryParts.push(`at ${collected.address.trim()}`);
  if (collected.notes?.trim()) summaryParts.push(`notes: ${collected.notes.trim()}`);
  const summary = `I'll book an appointment: ${summaryParts.join(", ")}.`;

  return {
    status: "confirming",
    summary,
    params: {
      name: collected.name,
      date: collected.date,
      startTime: collected.start_time,
      address: collected.address?.trim() || null,
      notes: collected.notes?.trim() || null,
    },
  };
}
