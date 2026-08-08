// components/admin/AdminCalendarTab.tsx
// Admin-only toggles for the calendar feature (/dashboard/calendar) --
// enabling the calendar page at all, and staff rostering specifically.
// Event booking has no toggle yet -- it's a deferred phase 2, not built.
// Modeled directly on AdminTimeTrackingTab.tsx.
"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Props {
  companyId: string;
}

interface Settings {
  enabled: boolean;
  rostering_enabled: boolean;
}

export default function AdminCalendarTab({ companyId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/calendar/settings");
    const json = await res.json();
    setSettings(json.settings);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useProgressBarWhile(loading);

  const save = async (next: Settings) => {
    setSettings(next);
    setSaving(true);
    setSaved(false);
    await fetch("/api/calendar/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (loading || !settings) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays size={14} className="text-indigo-500" />
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Calendar</p>
        </div>
        <label className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 rounded-2xl cursor-pointer">
          <span>
            <span className="block text-[12px] font-medium text-slate-700">Enable the Calendar page</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              Adds a Calendar page to the sidebar with month, week, and day views. Nothing shows until at least one
              function below is also turned on.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => save({ ...settings, enabled: e.target.checked })}
            className="accent-indigo-600 shrink-0"
          />
        </label>
        <label className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 rounded-2xl cursor-pointer">
          <span>
            <span className="block text-[12px] font-medium text-slate-700">Enable staff rostering</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              A weekly staff x day grid for building draft rosters, copying last week, and publishing -- shifts stay
              hidden from staff until published.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.rostering_enabled}
            onChange={(e) => save({ ...settings, rostering_enabled: e.target.checked })}
            className="accent-indigo-600 shrink-0"
          />
        </label>
        {saving && <p className="text-[10px] text-slate-300">Saving...</p>}
        {saved && <p className="text-[10px] text-emerald-500">Saved</p>}
      </div>
    </div>
  );
}
