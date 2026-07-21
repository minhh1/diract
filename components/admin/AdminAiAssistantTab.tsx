// components/admin/AdminAiAssistantTab.tsx
// Admin-only: which data sources feed the AI assistant, the company's
// self-hosted Ollama URL (if any), and the monthly token cap enforced in
// app/api/ai/chat/route.ts. The actual chat UI end users use lives at
// app/dashboard/ai/page.tsx.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

interface Props {
  companyId: string;
}

interface Settings {
  source_crm: boolean;
  source_gmail: boolean;
  source_whatsapp: boolean;
  source_teams: boolean;
  self_hosted_ollama_url: string | null;
  monthly_token_cap: number;
}

const SOURCE_TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: "source_crm", label: "CRM records (properties, entities, projects)" },
  { key: "source_gmail", label: "Gmail" },
  { key: "source_whatsapp", label: "WhatsApp" },
  { key: "source_teams", label: "Microsoft Teams" },
];

export default function AdminAiAssistantTab({ companyId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ai/settings");
    const json = await res.json();
    setSettings(json.settings);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (next: Settings) => {
    setSettings(next);
    setSaving(true);
    setSaved(false);
    await fetch("/api/ai/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} className="text-indigo-500" />
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Data sources</p>
        </div>
        <p className="text-[12px] text-slate-400 mb-4">
          Only enabled sources are embedded and retrievable by the assistant (see the Ask AI tab).
          Connect WhatsApp/Microsoft Teams under their own admin tabs first.
        </p>
        <div className="space-y-2">
          {SOURCE_TOGGLES.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={settings[key] as boolean}
                onChange={(e) => save({ ...settings, [key]: e.target.checked })}
                className="accent-indigo-600"
              />
              <span className="text-[12px] font-medium text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Self-hosted model (optional)</p>
        <p className="text-[12px] text-slate-400 mb-3">
          Point at an Ollama instance you run yourself (e.g. https://ollama.yourcompany.com). Its models appear
          in the model picker alongside the platform-hosted ones. Self-hosted usage is still metered at a flat
          per-token platform service fee, shown as an estimate before each answer.
        </p>
        <input
          value={settings.self_hosted_ollama_url ?? ""}
          onChange={(e) => setSettings({ ...settings, self_hosted_ollama_url: e.target.value })}
          onBlur={() => save(settings)}
          placeholder="https://ollama.yourcompany.com"
          className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Monthly token cap</p>
        <p className="text-[12px] text-slate-400 mb-3">
          Chat requests are blocked once this company&apos;s usage this billing period reaches the cap (see the
          usage meter in the Ask AI tab).
        </p>
        <input
          type="number"
          min={0}
          value={settings.monthly_token_cap}
          onChange={(e) => setSettings({ ...settings, monthly_token_cap: Number(e.target.value) })}
          onBlur={() => save(settings)}
          className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
        />
        <p className="text-[10px] text-slate-300 mt-2">{saving ? "Saving..." : saved ? "Saved" : ""}</p>
      </div>
    </div>
  );
}
