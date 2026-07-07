"use client";

import { Loader2, Download, ChevronDown } from "lucide-react";
import type { ImportSection } from "@/lib/import/buildTemplate";

type BaseMode = "properties" | "entities" | "projects";

interface Props {
  baseMode: BaseMode;
  onBaseModeChange: (mode: BaseMode) => void;
  sections: ImportSection[];
  sectionKey: string;
  onSectionChange: (key: string) => void;
  currentSection: ImportSection | undefined;
  isBaseSection: boolean;
  loadingSections: boolean;
  detectedNotice: string | null;
  onDownloadTemplate: () => void;
}

const BASE_MODES: { value: BaseMode; label: string }[] = [
  { value: 'properties', label: 'Properties' },
  { value: 'entities',   label: 'Entities' },
  { value: 'projects',   label: 'Projects' },
];

export default function SectionPicker({
  baseMode, onBaseModeChange,
  sections, sectionKey, onSectionChange,
  currentSection, isBaseSection,
  loadingSections, detectedNotice,
  onDownloadTemplate,
}: Props) {
  return (
    <div className="space-y-4">

      {/* Base mode selector */}
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Import type
        </p>
        <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
          {BASE_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => onBaseModeChange(m.value)}
              className={`flex-1 py-3 rounded-xl text-[11px] font-bold transition-all ${
                baseMode === m.value
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section selector */}
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Section
        </p>

        {loadingSections ? (
          <div className="flex items-center gap-2 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <Loader2 size={14} className="animate-spin text-slate-400" />
            <span className="text-[12px] text-slate-400">Loading sections...</span>
          </div>
        ) : (
          <div className="relative">
            <select
              value={sectionKey}
              onChange={e => onSectionChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 pl-5 pr-10 text-[13px] font-medium outline-none appearance-none focus:ring-2 focus:ring-indigo-100 cursor-pointer"
            >
              {sections.map(s => (
                <option key={s.key} value={s.key}>
                  {s.title}
                  {s.targetTable !== baseMode ? ` (child of ${baseMode})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
        )}
      </div>

      {/* Section description */}
      {currentSection && (
        <div className="flex items-start justify-between gap-4 p-5 bg-slate-50 border border-slate-100 rounded-[28px]">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-slate-700 mb-1">
              {currentSection.title}
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {isBaseSection
                ? `Import new ${baseMode} or update existing ones. Each row creates or updates one ${baseMode.slice(0, -1)} record.`
                : `Import ${currentSection.title.toLowerCase()} linked to existing ${baseMode}. Each row must include a property street address to match against.`
              }
            </p>
            <p className="text-[10px] text-slate-400 mt-2">
              {currentSection.headers.length} columns ·{' '}
              {(currentSection.customFields?.length || 0) > 0
                ? `${currentSection.customFields!.length} custom field${currentSection.customFields!.length !== 1 ? 's' : ''} included`
                : 'No custom fields'
              }
            </p>
          </div>

          {/* Download template button */}
          <button
            onClick={onDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0 shadow-sm"
          >
            <Download size={13} />
            Download template
          </button>
        </div>
      )}

      {/* Auto-detected notice */}
      {detectedNotice && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
          <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
            i
          </div>
          <p className="text-[12px] text-blue-700 font-medium">{detectedNotice}</p>
        </div>
      )}
    </div>
  );
}