// lib/rosterOverlap.ts
// Shared overlap check for roster_shifts -- used by both create and edit.
// A manager can't double-book the same person over the same time twice
// (e.g. to work around a shift only having one team) because that would
// double-count their hours in the weekly total; if a time block genuinely
// needs to count for two teams, that's a real product gap, not something
// to paper over by letting the same hours get logged twice.
export async function hasOverlappingShift(admin: any, params: {
  companyId: string; staffEntityId: string; shiftDate: string;
  startTime: string; endTime: string; excludeShiftId?: string;
}): Promise<boolean> {
  let query = admin.from("roster_shifts").select("id")
    .eq("company_id", params.companyId)
    .eq("staff_entity_id", params.staffEntityId)
    .eq("shift_date", params.shiftDate)
    .lt("start_time", params.endTime)
    .gt("end_time", params.startTime);
  if (params.excludeShiftId) query = query.neq("id", params.excludeShiftId);
  const { data } = await query.limit(1);
  return !!data && data.length > 0;
}
