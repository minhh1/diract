// components/admin/AdminDefaultSettingsTab.tsx
// One Admin tab ("Default Settings") covering the 4 "what does a new/
// existing record get by default" questions -- pill-tab switcher at the
// top, same pattern AdminGmailSyncTab.tsx uses for its own sub-sections,
// instead of 4 separate top-level Admin tabs or a sidebar sub-menu.
"use client";

import { useState } from "react";
import { Table2, LayoutGrid, LayoutDashboard, Settings } from "lucide-react";
import AdminDefaultViewsTab from "@/components/admin/AdminDefaultViewsTab";
import AdminDefaultTabsTab from "@/components/admin/AdminDefaultTabsTab";
import AdminDefaultTablesTab from "@/components/admin/AdminDefaultTablesTab";
import AdminDefaultDashboardsTab from "@/components/admin/AdminDefaultDashboardsTab";

interface Props { companyId: string; }

type Section = "views" | "tabs" | "tables" | "dashboards";

export default function AdminDefaultSettingsTab({ companyId }: Props) {
  const [section, setSection] = useState<Section>("views");

  const sections = [
    { id: "views" as const, label: "Default views", icon: Settings },
    { id: "tabs" as const, label: "Default tabs", icon: LayoutGrid },
    { id: "tables" as const, label: "Default tables", icon: Table2 },
    { id: "dashboards" as const, label: "Default dashboards", icon: LayoutDashboard },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold transition-all ${
                section === s.id
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-400"
              }`}
            >
              <Icon size={13} />
              {s.label}
            </button>
          );
        })}
      </div>

      {section === "views" && <AdminDefaultViewsTab companyId={companyId} />}
      {section === "tabs" && <AdminDefaultTabsTab companyId={companyId} />}
      {section === "tables" && <AdminDefaultTablesTab companyId={companyId} />}
      {section === "dashboards" && <AdminDefaultDashboardsTab companyId={companyId} />}
    </div>
  );
}
