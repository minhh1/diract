// components/admin/AdminTimeTrackingTab.tsx
// Admin-only opt-in for the browser-activity time-tracking extension (see
// app/api/time-tracking/sync/route.ts, which 403s until this is on).
// Workplace activity tracking is more sensitive than this app's other
// consent-gated features (the AI data access grant flow, the ai_enabled
// kill switch), so it never defaults to on -- this is the one switch that
// turns it on for the whole company. Modeled on AdminAiAssistantTab.tsx.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Props {
  companyId: string;
}

interface Settings {
  enabled: boolean;
}

export default function AdminTimeTrackingTab({ companyId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/time-tracking/settings");
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
    await fetch("/api/time-tracking/settings", {
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
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Timer size={14} className="text-indigo-500" />
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Browser time tracking</p>
        </div>
        <label className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 rounded-2xl cursor-pointer">
          <span>
            <span className="block text-[12px] font-medium text-slate-700">Allow the time-tracking browser extension</span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              Lets any team member connect the extension to passively track their active tab (domain and page title
              only, never full URLs or page content) and have it merged into their Auto Time Recording drafts. Off by
              default -- turning this on doesn't track anyone until they individually install and connect the
              extension themselves.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => save({ ...settings, enabled: e.target.checked })}
            className="accent-indigo-600 shrink-0"
          />
        </label>
        {saving && <p className="mt-2 text-[10px] text-slate-300">Saving...</p>}
        {saved && <p className="mt-2 text-[10px] text-emerald-500">Saved</p>}
      </div>
    </div>
  );
}
