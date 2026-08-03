"use client";

// Renders as a single button (see lib/dashboardWidgets/types.ts's
// AutoTimeRecordingButtonWidget); clicking it opens AutoTimeRecordingPanel,
// the AI-drafted Time & Fee Entries review/submit drawer. Sibling to
// MyTasksButtonWidget -- deliberately placed right next to it in the Time
// Entry dashboard's widgets_template (see supabase/template_law_firm_seed.sql).
import { useState } from "react";
import { Sparkles } from "lucide-react";
import AutoTimeRecordingPanel from "./AutoTimeRecordingPanel";

interface Props {
  label: string;
  isAdmin: boolean;
}

export default function AutoTimeRecordingButtonWidget({ label, isAdmin }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full h-full min-h-[56px] flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[12px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all"
      >
        <Sparkles size={16} /> {label}
      </button>
      {open && <AutoTimeRecordingPanel label={label} isAdmin={isAdmin} onClose={() => setOpen(false)} />}
    </>
  );
}
