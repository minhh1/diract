"use client";

// The "Finance Model search" dashboard widget -- search any project the
// signed-in viewer has access to and view its Finance Model inline. The
// search/Starred/Recent UX lives in ProjectSearchPicker.tsx (shared with
// the Residual Land Solver widget's "link to a project" flow); the picked
// project itself is session-local -- reopening the widget starts from the
// picker again.
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";
import ProjectSearchPicker, { type ProjectOption } from "./ProjectSearchPicker";

export default function FinanceModelSearchWidget() {
  const [selected, setSelected] = useState<ProjectOption | null>(null);

  if (selected) {
    return (
      <div className="space-y-3">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <ArrowLeft size={12} /> {selected.name}
        </button>
        <PublicFinanceModelContent projectId={selected.id} mode="internal" embedded />
      </div>
    );
  }

  return <ProjectSearchPicker onSelect={setSelected} />;
}
