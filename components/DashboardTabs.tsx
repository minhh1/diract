"use client";

import { LucideIcon } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  setActiveTab: (id: string) => void;
}

export default function DashboardTabs({ tabs, activeTab, setActiveTab }: Props) {
  return (
    <div className="flex gap-2 mt-8 bg-slate-100 p-1 rounded-full w-fit border border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 px-8 py-2 rounded-full text-[11px] font-medium transition-all duration-300 ${
            activeTab === tab.id 
            ? "bg-white text-black shadow-sm" 
            : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <tab.icon size={14} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}