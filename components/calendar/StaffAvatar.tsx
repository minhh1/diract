"use client";

// Deterministic per-staff color + circular avatar (profile pic if the
// linked profile has one, initials otherwise) -- shared between
// RosterWeekView, the month grid, and day view so the same staff member
// always reads as the same color everywhere on the calendar, like Google
// Calendar's per-calendar color coding.
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16"];

export function staffColor(staffId: string): string {
  let hash = 0;
  for (let i = 0; i < staffId.length; i++) hash = (hash * 31 + staffId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export interface StaffLike {
  id: string;
  name: string;
  avatar_url?: string | null;
}

export function StaffAvatar({ staff, size = 18 }: { staff: StaffLike; size?: number }) {
  const color = staffColor(staff.id);
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-black uppercase"
      style={{ width: size, height: size, backgroundColor: color, fontSize: Math.max(7, size * 0.4) }}
    >
      {staff.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staff.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        staff.name.slice(0, 2)
      )}
    </div>
  );
}
