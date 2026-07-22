"use client";

// "Code mode" -- a plain textarea (no CodeMirror/Monaco; this grammar is too
// simple to warrant either) bound to the dashboard's DSL source, debounced
// re-parse on change, an inline line-numbered error list, and a live preview
// of the successfully-parsed widgets rendered through the same
// DashboardWidgetRenderer everything else uses. Save is gated on zero
// parse errors -- an unresolved field reference should never become the
// dashboard's live config.
import { useState, useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import StaticWidgetGrid from "./StaticWidgetGrid";
import DashboardWidgetRenderer from "../DashboardWidgetRenderer";
import { parseDSL, type DslParseError } from "@/lib/dashboardWidgets/dsl";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";

interface Props {
  source: string;
  onSourceChange: (source: string) => void;
  onWidgetsChange: (widgets: DashboardWidget[]) => void;
  onErrorsChange: (errors: DslParseError[]) => void;
  fields: CustomTableField[];
  fieldById: Map<string, CustomTableField>;
  records: CustomTableRecord[];
  tableId: string;
  companyId: string;
  userId: string;
}

const EXAMPLE = `heading "My dashboard" level=1
filter_bar fields=
quick_add_form fields=
grid fields=
tile "Count" field= agg=count
chart date= value= agg=sum`;

export default function CodeEditor({
  source, onSourceChange, onWidgetsChange, onErrorsChange, fields, fieldById, records, tableId, companyId, userId,
}: Props) {
  const [errors, setErrors] = useState<DslParseError[]>([]);
  const [previewWidgets, setPreviewWidgets] = useState<DashboardWidget[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = parseDSL(source, fields);
      setErrors(result.errors);
      setPreviewWidgets(result.widgets);
      onErrorsChange(result.errors);
      onWidgetsChange(result.widgets);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, fields]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        <textarea
          value={source}
          onChange={e => onSourceChange(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          rows={18}
          className="w-full bg-slate-900 text-slate-100 font-mono text-[12px] leading-relaxed rounded-2xl p-4 outline-none focus:ring-4 focus:ring-indigo-100 resize-y"
        />
        {errors.length > 0 && (
          <div className="space-y-1 p-3 bg-red-50 border border-red-100 rounded-2xl">
            {errors.map((e, i) => (
              <p key={i} className="flex items-start gap-2 text-[11px] text-red-600">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span><strong>Line {e.line}:</strong> {e.message}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Live preview</p>
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl min-h-[300px]">
          <StaticWidgetGrid widgets={previewWidgets}>
            {(w) => (
              <DashboardWidgetRenderer
                widget={w}
                fields={fields}
                fieldById={fieldById}
                records={records}
                allRecords={records}
                tableId={tableId}
                companyId={companyId}
                userId={userId}
                filters={{}}
                setFilter={() => {}}
                onChanged={() => {}}
                mode="preview"
              />
            )}
          </StaticWidgetGrid>
        </div>
      </div>
    </div>
  );
}
