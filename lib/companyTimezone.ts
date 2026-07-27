// lib/companyTimezone.ts
// Every date/time computation the AI assistant does -- "today"/weekday
// resolution for relative dates, confirmation-summary weekday display, and
// the actual wall-clock time an AI-booked appointment lands on -- should be
// based on the company's own local time (companies.timezone, admin-set in
// Admin -> Company), not a hardcoded guess. Falls back to "UTC" only if the
// column somehow comes back empty (it's NOT NULL DEFAULT 'UTC', so this is
// just defense-in-depth, not the expected path).
export async function getCompanyTimezone(admin: any, companyId: string): Promise<string> {
  const { data } = await admin.from("companies").select("timezone").eq("id", companyId).maybeSingle();
  return data?.timezone || "UTC";
}
