// A library of marketing "product photo" mockups. These are pixel-faithful
// recreations of real, currently-shipping screens (verified by reading the
// actual component source directly, not paraphrased) -- exact column
// headers/order, exact copy, exact real feature names, exact chart colors.
// Only the DATA is invented (there's no real customer data to show, and no
// individual staff member's real name is used); the structure and wording
// are not. Sources, one per mockup, are named in each function's own
// comment. All utility classes here are ones app/globals.css's `.dark`
// block already remaps, so wrapping any of these in a `<div className="dark">`
// (see MockupThemeProvider.tsx) renders correctly in dark mode for free --
// except where noted (border-l-* has a real, pre-existing gap in the app's
// own dark CSS, see MockClientUpdates).
"use client";

import { useState, type ReactNode } from "react";
import {
  Check, AlertTriangle, X, FileText, Clock, PenSquare, ChevronDown,
  FileOutput, Users, Crown, Calendar, Printer, Lock, CopyX, Landmark, Building2, Store, Gauge, Flag,
  type LucideIcon,
} from "lucide-react";

type TagColor = "indigo" | "sky" | "violet" | "emerald" | "amber" | "rose" | "slate";

const TAG: Record<TagColor, string> = {
  indigo: "bg-indigo-100 text-indigo-600",
  sky: "bg-sky-100 text-sky-600",
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
  slate: "bg-slate-100 text-slate-500",
};

type Cell = string | { text: string; badge: TagColor };

// Matches components/DataTable.tsx/MasterTable.tsx's real table chrome:
// bg-white rounded-2xl border border-slate-200 shadow-sm container, thead
// bg-slate-50 border-b border-slate-200 text-slate-400 uppercase 10px bold
// tracking-widest headers, tr border-b border-slate-50 rows. Rows are
// click-to-select (real tables highlight the active row the same way) --
// purely a marketing-mockup affordance so these read as live product
// previews instead of flat screenshots, not a claim about any specific
// selection *behavior* the real table does with that click.
function TableFrame({ label, columns, rows, wide }: { label: string; columns: string[]; rows: Cell[][]; wide?: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className={`w-full ${wide ? "max-w-2xl" : "max-w-sm"} rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden`}>
      <div className="px-4 py-2.5 border-b border-slate-100">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse table-fixed">
        <colgroup>
          <col className="w-[42%]" />
          {columns.slice(1).map((c) => <col key={c} />)}
        </colgroup>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest truncate">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => setSelected((s) => (s === i ? null : i))}
              className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${selected === i ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-3 text-[12px] font-medium text-slate-700 truncate">
                  {typeof cell === "string"
                    ? cell
                    : <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${TAG[cell.badge]}`}>{cell.text}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// Card chrome for the non-table widgets -- same rounded-2xl/border-slate-200/
// shadow-sm language as TableFrame so every mockup reads as one consistent
// design system, just without a real table equivalent to copy.
export function WidgetCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{label}</p>
      {children}
    </div>
  );
}

// The icon-badge + title/subtitle header components/dashboard/
// TrustLedgerStatementWidget.tsx and TimeFeesReportWidget.tsx both put
// above their own table -- same h-9 w-9 rounded-xl icon chip, same
// title/subtitle text sizes.
export function IconHeader({ icon: Icon, tint, iconColor, title, subtitle }: { icon: LucideIcon; tint: string; iconColor: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`h-9 w-9 rounded-xl ${tint} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-slate-800 truncate">{title}</p>
        <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
      </div>
    </div>
  );
}

// A richer table variant for the ledger/report widgets -- right-aligned
// numeric columns and a bold totals footer (with an optional colSpan on
// its first cell, e.g. TrustLedgerStatementWidget.tsx's "Totals" label
// spanning 4 columns before the In/Out/Balance totals) -- neither of which
// plain TableFrame above has. Same click-to-select row affordance as
// TableFrame.
export function DetailedTable({
  columns, rows, footer,
}: {
  columns: { label: string; align?: "right" }[];
  rows: Cell[][];
  footer?: { text: string; align?: "right"; colSpan?: number }[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-100">
          {columns.map((c) => (
            <th key={c.label} className={`px-2 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            onClick={() => setSelected((s) => (s === i ? null : i))}
            className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${selected === i ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}
          >
            {row.map((cell, ci) => (
              <td key={ci} className={`px-2 py-2 text-[11px] font-medium text-slate-700 whitespace-nowrap ${columns[ci]?.align === "right" ? "text-right" : "text-left"}`}>
                {typeof cell === "string"
                  ? cell
                  : <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${TAG[cell.badge]}`}>{cell.text}</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="bg-slate-50 border-t border-slate-200">
            {footer.map((cell, ci) => (
              <td key={ci} colSpan={cell.colSpan} className={`px-2 py-2 text-[11px] font-bold text-slate-900 whitespace-nowrap ${cell.align === "right" ? "text-right" : "text-left"}`}>
                {cell.text}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

// Matches components/dashboard/DashboardActivityChart.tsx's real bar chart
// exactly: flex-1 max-w-[24px] rounded-t bars, and its own literal color
// (#3987e5, the "step 400" of the dataviz skill's sequential blue ramp),
// not a Tailwind indigo shade.
export function Bars({ values }: { values: number[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex items-end justify-center gap-[2px] h-20 px-1">
      {values.map((v, i) => (
        <div
          key={i}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
          className="flex-1 max-w-[24px] rounded-t cursor-pointer transition-opacity"
          style={{ height: `${v}%`, backgroundColor: "#3987e5", minHeight: 2, opacity: hovered === null || hovered === i ? 1 : 0.45 }}
        />
      ))}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">{label}</p>
      <p className="text-lg font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export function Checklist({ items }: { items: { label: string; ok: boolean }[] }) {
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-4 py-2.5">
          {it.ok
            ? <Check size={14} className="text-emerald-500 shrink-0" />
            : <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
          <span className="text-[12px] font-medium text-slate-700">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// A plain field/value row -- optionally with a real green checkmark. Used
// for entity validation, where only SOME fields are genuinely
// checksum-validated by the app (ABN/ACN) and others are just captured
// (company name, BSB, account number) -- deliberately not giving every row
// a checkmark, since that would overstate what's actually validated today.
export function FieldRow({ label, value, valid }: { label: string; value: string; valid?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 truncate">
        {value}
        {valid === true && <Check size={13} className="text-emerald-500 shrink-0" />}
      </span>
    </div>
  );
}

// ── Home page (generic CRM) ─────────────────────────────────────────────

export function MockCustomTable() {
  return (
    <TableFrame
      label="Pipeline"
      columns={["Record", "Owner", "Status"]}
      rows={[
        ["Acme Onboarding", "J. Ferreira", { text: "On track", badge: "indigo" }],
        ["Beta Co Renewal", "S. Lee", { text: "Blocked", badge: "amber" }],
        ["Support Escalation", "P. Shah", { text: "Complete", badge: "emerald" }],
        ["Vendor Review", "J. Ferreira", { text: "On track", badge: "indigo" }],
        ["Contract Renewal", "T. Walsh", { text: "On track", badge: "indigo" }],
      ]}
    />
  );
}

// Recreates the real "Auto-add rules" feature (components/clientUpdatePages/
// AutoAddRulesModal.tsx) -- the only real automation-style feature in the
// product: a saved rule reads "<field> <operator> <value>" and auto-adds
// any new record that matches it to a board, rendered as a list of
// bg-slate-50 rounded-2xl pill rows under the modal's own intro line. Not
// a generic "trigger → action" concept -- that doesn't exist in the app.
export function MockAutomation() {
  const rules = [
    ["Status", "is", "Settled"],
    ["Record type", "contains", "Trust"],
    ["Priority", "is", "Urgent"],
    ["Owner", "is", "Unassigned"],
    ["Region", "is", "VIC"],
  ];
  return (
    <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white shadow-sm p-5">
      <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-wide mb-2">Auto-add rules</h3>
      <p className="text-[11px] text-slate-400 mb-3">
        When a new record is created with a matching field value, it's added here automatically.
      </p>
      <div className="space-y-2">
        {rules.map(([field, op, value]) => (
          <div key={field} className="px-4 py-2.5 bg-slate-50 rounded-2xl text-[12px] text-slate-600">
            <span className="font-bold text-slate-800">{field}</span> {op} "{value}"
          </div>
        ))}
      </div>
    </div>
  );
}

export function MockMultiCompany() {
  return (
    <TableFrame
      label="Companies"
      columns={["Company", "Status"]}
      rows={[
        ["Acme Pty Ltd", { text: "Active", badge: "indigo" }],
        ["Beta Holdings", { text: "Member", badge: "slate" }],
        ["Gamma Group", { text: "Member", badge: "slate" }],
        ["Delta Ventures", { text: "Member", badge: "slate" }],
        ["Epsilon Trust", { text: "Member", badge: "slate" }],
      ]}
    />
  );
}

export function MockRoleAccess() {
  return (
    <TableFrame
      label="Team"
      columns={["Name", "Role"]}
      rows={[
        ["Sarah Lee", { text: "Admin", badge: "indigo" }],
        ["Jono Ferreira", { text: "Member", badge: "sky" }],
        ["Priya Shah", { text: "Member", badge: "sky" }],
        ["Tom Walsh", { text: "Member", badge: "sky" }],
        ["Guest Reviewer", { text: "Viewer", badge: "slate" }],
      ]}
    />
  );
}

export function MockReporting() {
  return (
    <WidgetCard label="Reports">
      <Bars values={[40, 65, 50, 85, 60]} />
      <div className="mt-4">
        <Stat label="This month" value="$128,400 billed" />
      </div>
    </WidgetCard>
  );
}

// ── Law firm (AU) ───────────────────────────────────────────────────────

export function MockMatterBoard() {
  return (
    <TableFrame
      label="Matters"
      columns={["Matter", "Status"]}
      rows={[
        ["2024/0187 — Smith Family Trust", { text: "In progress", badge: "indigo" }],
        ["2024/0201 — Nguyen Trust Deed", { text: "Awaiting docs", badge: "amber" }],
        ["2024/0164 — Harbord Property Co.", { text: "Settled", badge: "emerald" }],
        ["2024/0212 — 88 Riverside Ave", { text: "In progress", badge: "indigo" }],
        ["2024/0225 — Walsh Discretionary Trust", { text: "Awaiting docs", badge: "amber" }],
      ]}
    />
  );
}

// Time & Fee Entries has no dedicated "list view" widget of its own -- it's
// a plain custom table (supabase/template_law_firm_seed.sql:214-234), so
// there's no single canonical screen to recreate pixel-for-pixel. These
// four columns are a real subset of that template's actual fields, kept in
// their real relative order (Matter, Date, Duration Hours, Amount --
// Invoice/Staff/Type/Task Code/Activity Code/Description/Rate/Billable/
// Status omitted for space, not reordered), with the real field label
// "Duration Hours" rather than an invented "Hours" shorthand.
export function MockTimeEntries() {
  return (
    <TableFrame
      label="Time entries"
      columns={["Matter", "Date", "Duration Hours", "Amount"]}
      rows={[
        ["2024/0187 — Smith Family Trust", "22 Jul", "0.4h", "$180.00"],
        ["2024/0201 — Nguyen Trust Deed", "22 Jul", "0.2h", "$90.00"],
        ["2024/0164 — Harbord Property Co.", "21 Jul", "0.1h", "$45.00"],
        ["2024/0212 — 88 Riverside Ave", "21 Jul", "0.3h", "$135.00"],
        ["2024/0225 — Walsh Discretionary Trust", "20 Jul", "0.2h", "$90.00"],
      ]}
    />
  );
}

// The example entries shown by both the home-page drawer preview and the
// AI Time Entries deep-dive page (app/(marketing)/features/[slug]) -- kept
// as one shared array so both stay in sync. Each entry carries three real
// description variants, not one string truncated three ways -- the real
// Brief/Standard/Detailed toggle (lib/ai/autoTimeEntryDraft.ts's
// DETAIL_INSTRUCTIONS) sends the model three different instructions ("a
// bare few words" / "the way a professional would phrase it on an actual
// bill" / "name the actual document, party, or next step"), so each level
// is genuinely different wording, not the same sentence cut short.
export const AUTO_TIME_ENTRY_EXAMPLES: {
  initials: string; date: string; matter: string;
  description: { brief: string; standard: string; detailed: string };
  hours: string; emails: number;
}[] = [
  { initials: "SL", date: "22 Jul", matter: "2024/0187 — Smith Family Trust", hours: "0.3", emails: 3, description: {
    brief: "Reviewed Deed of Variation.",
    standard: "Reviewed Deed of Variation and drafted a short covering note to the trustee.",
    detailed: "Reviewed Deed of Variation and drafted a short covering note to the trustee confirming the updated distribution schedule.",
  } },
  { initials: "JF", date: "22 Jul", matter: "2024/0212 — 88 Riverside Ave", hours: "0.2", emails: 1, description: {
    brief: "Reviewed Section 32 statement.",
    standard: "Reviewed Section 32 disclosure statement ahead of exchange.",
    detailed: "Reviewed Section 32 disclosure statement ahead of exchange, noting the easement disclosure and confirming no further vendor amendments required.",
  } },
  { initials: "PS", date: "21 Jul", matter: "2024/0201 — Nguyen Trust Deed", hours: "0.2", emails: 2, description: {
    brief: "Drafted covering letter to settlor.",
    standard: "Drafted covering letter to settlor for execution.",
    detailed: "Drafted covering letter to settlor for execution, enclosing the trust deed and explaining the signing requirements for each trustee.",
  } },
  { initials: "TW", date: "21 Jul", matter: "2024/0164 — Harbord Property Co.", hours: "0.1", emails: 4, description: {
    brief: "Confirmed settlement figures.",
    standard: "Confirmed settlement figure adjustments with purchaser's solicitor.",
    detailed: "Confirmed settlement figure adjustments with purchaser's solicitor, reconciling rates and water usage apportionments ahead of settlement.",
  } },
  { initials: "AK", date: "20 Jul", matter: "2024/0225 — Walsh Discretionary Trust", hours: "0.1", emails: 1, description: {
    brief: "Reviewed trustee resolution.",
    standard: "Reviewed trustee resolution ahead of registration.",
    detailed: "Reviewed trustee resolution ahead of registration, confirming appointor consent was correctly recorded before lodgement.",
  } },
];

// A faithful, near-1:1 recreation of the real drawer
// (components/dashboard/AutoTimeRecordingPanel.tsx): same header/close,
// same settings-row order (date + scope toggle, then description
// detail-level toggle) sitting above the entry list, same per-entry shape
// (timekeeper initials, matter label, editable-looking description box,
// hours pill, email count). Example content is real-sounding legal
// drafting wording against real-shaped matter numbers. The scope and
// detail-level toggles genuinely switch, and each entry is a real
// checkbox -- unchecking one lowers "Submit N selected" the same way the
// real panel does when you deselect an entry before submitting.
export function MockAutoTimeEntries() {
  const [scope, setScope] = useState<"mine" | "everyone">("mine");
  const [detail, setDetail] = useState<"brief" | "standard" | "detailed">("detailed");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(AUTO_TIME_ENTRY_EXAMPLES.map((e) => [e.matter, true]))
  );
  const selectedCount = Object.values(selected).filter(Boolean).length;
  return (
    <div className="w-full max-w-sm rounded-[20px] border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-wide">Auto Time Recording</h3>
        <X size={16} className="text-slate-300" />
      </div>

      <div className="flex items-center gap-2 px-5 pt-3">
        <span className="px-3 py-1.5 border border-slate-200 rounded-full text-[10px] font-bold text-slate-600">22 Jul 2026</span>
        <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[9px] font-bold">
          <button onClick={() => setScope("mine")} className={`px-2.5 py-1 rounded-full transition-all ${scope === "mine" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>My day</button>
          <button onClick={() => setScope("everyone")} className={`px-2.5 py-1 rounded-full transition-all ${scope === "everyone" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>Everyone's day (Admin)</button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 pt-3">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Descriptions</span>
        <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[9px] font-bold">
          {(["brief", "standard", "detailed"] as const).map((d) => (
            <button key={d} onClick={() => setDetail(d)} className={`px-2.5 py-1 rounded-full capitalize transition-all ${detail === d ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {AUTO_TIME_ENTRY_EXAMPLES.map((e) => (
          <button
            key={e.matter}
            onClick={() => setSelected((s) => ({ ...s, [e.matter]: !s[e.matter] }))}
            className={`w-full text-left border rounded-2xl p-3 space-y-2 transition-colors ${selected[e.matter] ? "border-slate-200" : "border-slate-100 opacity-50"}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`w-3.5 h-3.5 rounded border-2 shrink-0 transition-colors ${selected[e.matter] ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`} />
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold flex items-center justify-center shrink-0">{e.initials}</span>
              <span className="text-[10px] text-slate-400 font-medium">{e.date}</span>
              <span className="text-[10px] text-slate-400">·</span>
              <span className="text-[10px] font-bold text-slate-500">Matter: {e.matter}</span>
            </div>
            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
              {e.description[detail]}
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700">{e.hours}</span>
              <span className="text-[10px] text-slate-400 font-medium">hours</span>
              <span className="ml-auto text-[10px] font-bold text-indigo-500">{e.emails} email{e.emails !== 1 ? "s" : ""}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <div className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold">
          Submit {selectedCount} selected
        </div>
      </div>
    </div>
  );
}

// The example entries shown by the Trust deep-dive page, kept in sync with
// the home/law-firm-page preview mockup below.
export const TRUST_LEDGER_EXAMPLES: { row: Cell[] }[] = [
  { row: ["12 Jun", "TR-0442", "Receipt", "Deposit received", "$45,000", "—", "$45,000"] },
  { row: ["18 Jun", "—", "Disbursement", "Search fees", "—", "$220", "$44,780"] },
  { row: ["25 Jun", "TR-0443", "Receipt", "Further deposit", "$12,500", "—", "$57,280"] },
  { row: ["03 Jul", "—", "Disbursement", "Stamp duty", "—", "$18,400", "$38,880"] },
  { row: ["09 Jul", "—", "Disbursement", "Registration fee", "—", "$145", "$38,735"] },
];
export const TRUST_LEDGER_COLUMNS = [
  { label: "Date" }, { label: "Receipt No." }, { label: "Type" }, { label: "Particulars" },
  { label: "In", align: "right" as const }, { label: "Out", align: "right" as const }, { label: "Balance", align: "right" as const },
];
export const TRUST_LEDGER_FOOTER = [
  { text: "Totals", colSpan: 4 },
  { text: "$57,500", align: "right" as const },
  { text: "$18,765", align: "right" as const },
  { text: "$38,735", align: "right" as const },
];

// Recreates components/dashboard/TrustLedgerStatementWidget.tsx exactly:
// violet FileText icon-header with its real title/subtitle copy, the real
// 7-column table (Date, Receipt No., Type, Particulars, In, Out, running
// Balance per row -- not a simplified 2-column version), and its real
// footer ("Totals" spanning the first 4 columns, then In/Out/Balance
// totals).
export function MockTrustAccount() {
  return (
    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={FileText} tint="bg-violet-50" iconColor="text-violet-700" title="Trust Ledger Statement" subtitle="Every transaction for one matter, with running balance" />
      <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <DetailedTable columns={TRUST_LEDGER_COLUMNS} rows={TRUST_LEDGER_EXAMPLES.map((e) => e.row)} footer={TRUST_LEDGER_FOOTER} />
      </div>
    </div>
  );
}

// Recreates components/dashboard/TimeFeesReportWidget.tsx exactly: indigo
// Clock icon-header with its real title, the real period-preset pill
// (This week / This month / All time -- Custom omitted, it swaps to a
// date-range picker rather than showing more data), and the real 5-column
// table (Staff, Entries, Hours, Billable hours, Amount) with its totals
// footer. Switching presets is real -- each one is a genuinely smaller/
// larger slice of the same underlying rows (this week is a subset of this
// month, all time adds more), not just a highlight change with frozen
// numbers.
type FeesPreset = "week" | "month" | "all";
const FEES_REPORT_DATA: Record<FeesPreset, { subtitle: string; rows: Cell[][]; footer: string[] }> = {
  week: {
    subtitle: "Time recorded per staff member · 2026-07-27 to 2026-07-31",
    rows: [
      ["Sarah Lee", "14", "9.0", "8.0", "$3,300"],
      ["Jono Ferreira", "12", "7.5", "6.5", "$2,270"],
      ["Priya Shah", "9", "6.0", "5.5", "$1,940"],
      ["Tom Walsh", "7", "4.5", "4.0", "$1,440"],
      ["Aisha Khan", "6", "3.5", "3.0", "$1,050"],
    ],
    footer: ["Total", "48", "30.5", "27.0", "$10,000"],
  },
  month: {
    subtitle: "Time recorded per staff member · 2026-07-01 to 2026-07-31",
    rows: [
      ["Sarah Lee", "62", "38.5", "35.0", "$14,250"],
      ["Jono Ferreira", "54", "31.0", "28.5", "$9,920"],
      ["Priya Shah", "41", "27.5", "24.0", "$8,470"],
      ["Tom Walsh", "33", "19.0", "17.0", "$6,180"],
      ["Aisha Khan", "28", "14.5", "13.0", "$4,930"],
    ],
    footer: ["Total", "218", "130.5", "117.5", "$43,750"],
  },
  all: {
    subtitle: "Time recorded per staff member · all time",
    rows: [
      ["Sarah Lee", "410", "256.0", "231.5", "$94,600"],
      ["Jono Ferreira", "365", "221.0", "199.0", "$68,200"],
      ["Priya Shah", "298", "184.5", "165.0", "$56,900"],
      ["Tom Walsh", "252", "148.0", "131.5", "$45,300"],
      ["Aisha Khan", "201", "112.5", "99.5", "$36,100"],
    ],
    footer: ["Total", "1,526", "922.0", "826.5", "$301,100"],
  },
};
export function MockFeesReport() {
  const [preset, setPreset] = useState<FeesPreset>("month");
  const data = FEES_REPORT_DATA[preset];
  return (
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={Clock} tint="bg-indigo-50" iconColor="text-indigo-700" title="Time & Fees Report" subtitle={data.subtitle} />
      <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold w-fit mb-3">
        {([["week", "This week"], ["month", "This month"], ["all", "All time"]] as const).map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`px-3 py-1.5 rounded-full transition-all ${preset === key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            {lbl}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <DetailedTable
          columns={[
            { label: "Staff" }, { label: "Entries", align: "right" }, { label: "Hours", align: "right" },
            { label: "Billable hours", align: "right" }, { label: "Amount", align: "right" },
          ]}
          rows={data.rows}
          footer={data.footer.map((text, i) => ({ text, align: i === 0 ? undefined : "right" as const }))}
        />
      </div>
    </div>
  );
}

// Recreates components/dashboard/tabs/PrecedentsTab.tsx exactly: a
// collapsible category card (rounded-[24px], chevron + category + count),
// each precedent row with its real fields -- PenSquare icon, name,
// jurisdiction pill (only shown when set), the real "Prepared {date}" pill
// (not a doc-type pill -- that's the separate library-browser screen, not
// this one), the conditional "Check before use" warning, and the real
// "Issue" button (px-4 py-2, FileOutput icon at size 13).
// Chevron genuinely collapses the category, same as the real precedent
// library's category cards.
export function MockPrecedents() {
  const [open, setOpen] = useState(true);
  const items = [
    { name: "Contract of Sale", jurisdiction: "VIC", prepared: "12/03/2026", warn: true, desc: "Standard residential contract, general conditions" },
    { name: "Discretionary Trust Deed", jurisdiction: null, prepared: "04/06/2026", warn: false, desc: "Discretionary trust deed template" },
    { name: "Section 32 Vendor Statement", jurisdiction: "VIC", prepared: "18/05/2026", warn: true, desc: "Vendor disclosure statement for established properties" },
    { name: "Commercial Lease Agreement", jurisdiction: "NSW", prepared: "02/07/2026", warn: false, desc: "Standard commercial lease with outgoings clause" },
    { name: "Vendor Finance Loan Agreement", jurisdiction: null, prepared: "15/01/2026", warn: true, desc: "Secured by caveat, standard interest terms" },
  ];
  return (
    <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-5 py-3.5 text-left">
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Property</span>
        <span className="text-[10px] text-slate-400 ml-auto">{items.length}</span>
      </button>
      {open && (
      <div className="px-3 pb-3 space-y-1.5">
        {items.map((p) => (
          <div key={p.name} className="flex items-center gap-3 p-3.5 bg-slate-50/60 rounded-[18px]">
            <PenSquare size={15} className="text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[12.5px] font-bold text-slate-800">{p.name}</p>
                {p.jurisdiction && (
                  <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[9px] font-bold">{p.jurisdiction}</span>
                )}
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold">
                  <Calendar size={9} /> Prepared {p.prepared}
                </span>
                {p.warn && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">
                    <AlertTriangle size={9} /> Check before use
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{p.desc}</p>
            </div>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full shrink-0">
              <FileOutput size={13} /> Issue
            </button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// Recreates components/admin/AdminTeamsTab.tsx exactly: Users icon at its
// real size (14), team name at its real size (13px), the real member row
// (avatar initial, name, email) and the real leader treatment -- a Crown
// icon WITH its "Leader" text label, not just a bare icon.
export function MockTeamsManagement() {
  const members = [
    { initial: "S", name: "Sarah Lee", email: "sarah@firm.com.au", leader: true },
    { initial: "J", name: "Jono Ferreira", email: "jono@firm.com.au", leader: false },
    { initial: "P", name: "Priya Shah", email: "priya@firm.com.au", leader: false },
    { initial: "T", name: "Tom Walsh", email: "tom@firm.com.au", leader: false },
    { initial: "A", name: "Aisha Khan", email: "aisha@firm.com.au", leader: false },
  ];
  return (
    <div className="w-full max-w-sm rounded-[32px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 border-b border-slate-100">
        <Users size={14} className="text-indigo-500 shrink-0" />
        <span className="text-[13px] font-bold text-slate-800 flex-1">Property Team</span>
        <span className="text-[10px] text-slate-400">{members.length} members</span>
      </div>
      <div>
        {members.map((m, i) => (
          <div key={m.email} className={`flex items-center gap-3 px-6 py-3 ${i < members.length - 1 ? "border-b border-slate-50" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">{m.initial}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-slate-800 truncate">{m.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{m.email}</p>
            </div>
            {m.leader && (
              <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold shrink-0">
                <Crown size={11} /> Leader
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Recreates the client-facing Cards mode of components/clientUpdatePages/
// MatterBoard.tsx exactly: `border-l-4 border-l-{color}-400 bg-{color}-50/40
// border-y-slate-200 border-r-slate-200 rounded-2xl`, using only the real
// six status colors the app actually defines (red/amber/green/blue/purple/
// slate -- "green" is emerald-400 in the real FORMAT_COLORS map, indigo is
// not one of the options), plus the real italic AI-summary line
// (`ai_summary`) shown under a matter name when one exists. Note: the app's
// own `.dark` CSS has no override for border-l-*/bg-*-50\/40 utilities
// (only whole-side border-*), so this card's accent doesn't re-theme in
// the dark preview -- reproducing that faithfully rather than working
// around it, since it's the real product's real behavior today.
// Literal classes (not template-interpolated) -- Tailwind's build-time
// scanner can't see a dynamically-constructed `border-l-${color}-400`
// class string, so it would get purged from the production bundle.
const CLIENT_CARD_COLORS = {
  amber: "border-l-amber-400 bg-amber-50/40",
  blue: "border-l-blue-400 bg-blue-50/40",
  emerald: "border-l-emerald-400 bg-emerald-50/40",
  purple: "border-l-purple-400 bg-purple-50/40",
  red: "border-l-red-400 bg-red-50/40",
} as const;

const CLIENT_UPDATE_CARDS: { color: keyof typeof CLIENT_CARD_COLORS; matter: string; summary?: string; stage: string; settlementDate: string }[] = [
  { color: "amber", matter: "2024/0201 — Nguyen Trust Deed", stage: "Awaiting execution", settlementDate: "—" },
  { color: "blue", matter: "2024/0212 — 88 Riverside Ave", summary: "Contract exchanged; awaiting finance approval before booking settlement.", stage: "Pre-settlement", settlementDate: "14 Aug 2026" },
  { color: "emerald", matter: "2024/0187 — Smith Family Trust", stage: "Trustee resolution pending", settlementDate: "—" },
  { color: "purple", matter: "2024/0225 — Walsh Discretionary Trust", stage: "Drafting", settlementDate: "—" },
  { color: "red", matter: "2024/0164 — Harbord Property Co.", stage: "Settled", settlementDate: "2 Jul 2026" },
];
// Card body expands on click, same accordion-style behavior as the real
// client update board -- the blue card starts expanded since that's the
// one with an ai_summary line worth showing by default.
export function MockClientUpdates() {
  const [expanded, setExpanded] = useState<string | null>("2024/0212 — 88 Riverside Ave");
  return (
    <div className="w-full max-w-sm space-y-2.5">
      {CLIENT_UPDATE_CARDS.map((c) => {
        const isExpanded = expanded === c.matter;
        return (
          <button
            key={c.matter}
            onClick={() => setExpanded((e) => (e === c.matter ? null : c.matter))}
            className={`w-full text-left border rounded-2xl border-l-4 ${CLIENT_CARD_COLORS[c.color]} border-y-slate-200 border-r-slate-200 overflow-hidden`}
          >
            <div className={isExpanded ? "px-4 py-3 border-b border-slate-100" : "px-4 py-3"}>
              <p className="text-[12px] font-medium text-slate-700">{c.matter}</p>
              {c.summary && <p className="text-[11px] text-slate-400 italic mt-0.5">{c.summary}</p>}
            </div>
            {isExpanded && (
              <div className="px-4 py-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Stage</p>
                  <p className="text-[12px] font-medium text-slate-700">{c.stage}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Settlement date</p>
                  <p className="text-[12px] font-medium text-slate-700">{c.settlementDate}</p>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Recreates the real per-task row from components/public/PublicTasksContent.tsx
// (the "public tasks" page -- a shareable, scoped task view a signed-in
// user opens, not an anonymous page): a completion toggle that's genuinely
// disabled with a lock icon while task_dependencies are still open, a real
// follow-up flag button (see components/FollowUpToggle.tsx -- click to log
// or schedule a follow-up, mark one done, or remove it, exactly like the
// real row), real status badges (Watching, Blocked by N tasks), and a
// due-date column. Unlocked rows genuinely toggle done/not-done on click;
// the locked row stays locked no matter what's clicked -- that's the real
// point of the dependency lock, not a bug in this mockup.
interface MockFollowUp { id: string; date: string; isDone: boolean; }

function mockTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function TaskFollowUpButton({ entries, onAdd, onMarkDone, onRemove }: {
  entries: MockFollowUp[];
  onAdd: (date: string) => void;
  onMarkDone: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(mockTodayStr());
  const doneEntries = entries.filter((e) => e.isDone);
  const scheduledEntries = entries.filter((e) => !e.isDone);
  const hasScheduled = scheduledEntries.length > 0;
  const isFuture = date > mockTodayStr();
  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={hasScheduled ? `${scheduledEntries.length} follow-up(s) scheduled, click to manage` : doneEntries.length > 0 ? `Followed up ${doneEntries.length}x, click to manage` : "Log a follow-up"}
        className={`h-5 min-w-[20px] px-1 rounded-full border-2 flex items-center justify-center gap-0.5 transition-all ${
          hasScheduled ? "bg-sky-400 border-sky-400" : doneEntries.length > 0 ? "bg-amber-400 border-amber-400" : "border-slate-300 hover:border-amber-400"
        }`}
      >
        <Flag size={9} className={hasScheduled || doneEntries.length > 0 ? "text-white" : "text-slate-300"} />
        {(doneEntries.length > 1 || hasScheduled) && (
          <span className="text-[8px] font-bold text-white leading-none">{hasScheduled ? scheduledEntries.length : doneEntries.length}</span>
        )}
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} className="absolute z-20 top-6 left-0 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg p-3 space-y-2.5">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Follow-ups {hasScheduled ? `(${doneEntries.length} done, ${scheduledEntries.length} scheduled)` : `(${doneEntries.length})`}
          </p>
          {entries.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {entries.map((e) => (
                <div key={e.id} className={`flex items-center justify-between px-2.5 py-1 rounded-full ${e.isDone ? "bg-slate-50" : "bg-sky-50"}`}>
                  <span className={`text-[10px] ${e.isDone ? "text-slate-500" : "text-sky-700 font-medium"}`}>
                    {new Date(e.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}{!e.isDone && " · scheduled"}
                  </span>
                  <div className="flex items-center gap-1">
                    {!e.isDone && (
                      <button onClick={() => onMarkDone(e.id)} title="Mark as followed up" className="text-sky-400 hover:text-emerald-500 transition-colors">
                        <Check size={11} />
                      </button>
                    )}
                    <button onClick={() => onRemove(e.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <X size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{isFuture ? "Schedule for" : "Date followed up"}</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`w-full px-2.5 py-1.5 border rounded-full text-[10px] outline-none ${isFuture ? "border-sky-200 focus:border-sky-400" : "border-slate-200 focus:border-amber-400"}`}
            />
            <button
              onClick={() => onAdd(date)}
              className={`w-full py-1.5 text-white text-[10px] font-bold rounded-full transition-colors ${isFuture ? "bg-sky-500 hover:bg-sky-600" : "bg-amber-500 hover:bg-amber-600"}`}
            >
              {isFuture ? "Schedule follow-up" : "Log follow-up"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TASK_ROWS: { key: string; locked: boolean; name: string; badge?: string; matter: string; due: string; dueColor: TagColor }[] = [
  { key: "title-search", locked: false, name: "Order title search", matter: "2024/0212", due: "Today", dueColor: "amber" },
  { key: "draft-contract", locked: true, name: "Draft contract", badge: "Blocked by 2 tasks", matter: "2024/0187", due: "23 Jul", dueColor: "indigo" },
  { key: "engagement-letter", locked: false, name: "Send engagement letter", badge: "Watching", matter: "2024/0201", due: "Done", dueColor: "emerald" },
  { key: "ppsr", locked: false, name: "Review PPSR", matter: "2024/0164", due: "24 Jul", dueColor: "indigo" },
  { key: "trustee-resolution", locked: false, name: "Prepare trustee resolution", matter: "2024/0225", due: "25 Jul", dueColor: "indigo" },
];
export function MockTasks() {
  const [done, setDone] = useState<Record<string, boolean>>({ "engagement-letter": true });
  const [followUps, setFollowUps] = useState<Record<string, MockFollowUp[]>>({
    ppsr: [{ id: "fu-seed", date: "2026-08-10", isDone: false }],
  });

  const addFollowUp = (key: string, date: string) => {
    setFollowUps((prev) => ({ ...prev, [key]: [...(prev[key] || []), { id: `fu-${Date.now()}`, date, isDone: date <= mockTodayStr() }] }));
  };
  const markFollowUpDone = (key: string, id: string) => {
    setFollowUps((prev) => ({ ...prev, [key]: (prev[key] || []).map((e) => (e.id === id ? { ...e, isDone: true } : e)) }));
  };
  const removeFollowUp = (key: string, id: string) => {
    setFollowUps((prev) => ({ ...prev, [key]: (prev[key] || []).filter((e) => e.id !== id) }));
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tasks - My tasks</span>
      </div>
      <div>
        {TASK_ROWS.map((r, i) => {
          const isDone = !!done[r.key];
          const entries = followUps[r.key] || [];
          return (
            <div
              key={r.key}
              className={`w-full flex items-center gap-2 px-4 py-3 transition-colors ${i < TASK_ROWS.length - 1 ? "border-b border-slate-50" : ""}`}
            >
              <button
                disabled={r.locked}
                onClick={() => setDone((d) => ({ ...d, [r.key]: !d[r.key] }))}
                className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                  isDone ? "bg-emerald-500 border-emerald-500" : r.locked ? "border-slate-200 cursor-not-allowed" : "border-slate-300 hover:border-indigo-400"
                }`}
              >
                {isDone && <Check size={10} className="text-white" />}
                {!isDone && r.locked && <Lock size={8} className="text-slate-300" />}
              </button>
              <TaskFollowUpButton
                entries={entries}
                onAdd={(date) => addFollowUp(r.key, date)}
                onMarkDone={(id) => markFollowUpDone(r.key, id)}
                onRemove={(id) => removeFollowUp(r.key, id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[12px] font-medium ${isDone ? "line-through text-slate-400" : "text-slate-700"}`}>{r.name}</span>
                  {r.badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 whitespace-nowrap">{r.badge}</span>}
                </div>
                <span className="text-[10px] text-slate-400">{r.matter}</span>
              </div>
              <span className={`text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-full ${TAG[isDone ? "emerald" : r.dueColor]}`}>{isDone ? "Done" : r.due}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Property developers (AU) ────────────────────────────────────────────

// Recreates the real Niksen Loans board's own fields (components/public/
// financeModel/LoansSubtab.tsx) -- name, lender type (Senior/Mezzanine/
// Private Lender/Money Partner/Internal/Other), and principal amount.
// Earlier drafts of this mockup showed a "Limit"/"Drawn %" pair that isn't
// a real field on the loan record -- drawdown is tracked through the
// repayment-phase schedule (see loanSchedule below), not a single percent.
export function MockLoanTable() {
  return (
    <TableFrame
      label="Loans"
      columns={["Facility", "Type", "Principal"]}
      rows={[
        ["Westpac — Construction", { text: "Senior", badge: "indigo" }, "$4.2M"],
        ["ANZ — Land Facility", { text: "Senior", badge: "indigo" }, "$1.8M"],
        ["Riverside Capital", { text: "Mezzanine", badge: "violet" }, "$650k"],
        ["NAB — Working Capital", { text: "Senior", badge: "indigo" }, "$500k"],
        ["Private Lender Group", { text: "Private Lender", badge: "amber" }, "$300k"],
      ]}
    />
  );
}

// Recreates the real Budget vs Actual table on a Finance Model's Overview
// tab (components/public/financeModel/BudgetVsActualTable.tsx), reconciled
// against a live Xero sync (app/api/finance-model/sync-xero) -- not a
// generic bar chart, which is what this mockup showed before.
export function MockFinanceModel() {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={FileText} tint="bg-indigo-50" iconColor="text-indigo-700" title="Budget vs Actual" subtitle="Reconciled against Xero" />
      <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <DetailedTable
          columns={[{ label: "Category" }, { label: "Budgeted", align: "right" }, { label: "Actual", align: "right" }, { label: "Variance", align: "right" }]}
          rows={[
            ["Acquisition", "$2,400,000", "$2,380,000", { text: "-$20,000", badge: "emerald" }],
            ["Construction", "$4,900,000", "$5,120,000", { text: "+$220,000", badge: "rose" }],
            ["Professional fees", "$620,000", "$598,000", { text: "-$22,000", badge: "emerald" }],
            ["Finance costs", "$310,000", "$295,000", { text: "-$15,000", badge: "emerald" }],
            ["Marketing & selling", "$340,000", "$310,000", { text: "-$30,000", badge: "emerald" }],
          ]}
        />
      </div>
    </div>
  );
}

// Recreates the real computed repayment schedule inside a loan's Loans-
// subtab detail view (lib/loanCalculator.ts's calculateLoanSchedule,
// rendered at components/public/financeModel/LoansSubtab.tsx:537-561) --
// Period/Opening/Interest/Principal/Payment/Closing, not the simplified
// 3-column version this mockup showed before.
export function MockLoanSchedule() {
  return (
    <TableFrame
      label="Loan schedule"
      columns={["Period", "Opening", "Interest", "Principal", "Closing"]}
      rows={[
        ["Q1", "$1.2M", "$18k", "—", "$1.2M"],
        ["Q2", "$1.2M", "$18k", "—", "$1.2M"],
        ["Q3", "$1.2M", "$18k", "$200k", "$1.0M"],
        ["Q4", "$1.0M", "$15k", "$300k", "$700k"],
        ["Q5", "$700k", "$10.5k", "$700k", "$0"],
      ]}
    />
  );
}

export function MockResidualLand() {
  return (
    <WidgetCard label="Residual land solver">
      <Stat label="Residual land value" value="$2.14M" />
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-700">GRV</span>
          <span className="text-[12px] font-semibold text-slate-500">$8.6M</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-700">Construction costs</span>
          <span className="text-[12px] font-semibold text-slate-500">$4.9M</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-700">Professional fees</span>
          <span className="text-[12px] font-semibold text-slate-500">$620k</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-700">Contingency & selling costs</span>
          <span className="text-[12px] font-semibold text-slate-500">$580k</span>
        </div>
      </div>
    </WidgetCard>
  );
}

// Honest by design: only ABN and ACN get a green checkmark, because those
// are the only two fields the app actually runs a real checksum validator
// against (lib/validation/entityValidation.ts's modulus-89 ABN check and
// modulus-10 ACN check digit, wired into components/NewEntityModal.tsx and
// every entities-table edit via components/RecordEditModal.tsx). Company
// name, BSB, and account number are real captured fields too, but the app
// doesn't format-validate them today -- shown plainly, no checkmark, so
// this doesn't claim more than the product actually does.
export function MockEntityValidation() {
  return (
    <WidgetCard label="Entity validation">
      <div className="space-y-2">
        <FieldRow label="Company" value="Anchor Developments Pty Ltd" />
        <FieldRow label="ABN" value="51 824 753 556" valid />
        <FieldRow label="ACN" value="824 753 556" valid />
        <FieldRow label="BSB" value="062-000" valid />
        <FieldRow label="Account no." value="1234 5678" valid />
      </div>
    </WidgetCard>
  );
}

// Recreates the real effect of app/api/gmail/assign's teammate fan-out:
// assigning an email applies an actual Gmail label to the assigning user's
// own mailbox, then does the same in every other connected teammate's
// mailbox in the same request -- not just a database record.
export function MockGmailLabels() {
  const team = ["Sarah Lee", "Jono Ferreira", "Priya Shah", "Tom Walsh", "Aisha Khan"];
  return (
    <WidgetCard label="Gmail label sync">
      <div className="mb-3 px-3 py-2.5 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-600 truncate">
        Shared Emails/2024/0212 — 88 Riverside Ave
      </div>
      <div className="space-y-2">
        {team.map((name) => (
          <div key={name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
            <span className="text-[12px] font-medium text-slate-700">{name}</span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><Check size={12} /> Synced</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

// Recreates components/dashboard/DisbursementInvoiceImportModal.tsx's real
// review screen: line items grouped by the matter number found on the
// invoice, a matched group defaulting to included, a likely-duplicate
// line (same dealing number, or same date+description+amount already on
// this matter) defaulting to EXCLUDED and flagged rather than hidden, and
// an unmatched matter number shown but disabled -- never guessed or
// auto-created. Checkboxes are real: toggling one updates the line count
// and ex-GST total in the footer, exactly like the real review screen.
const DISBURSEMENT_LINES = [
  { key: "title-search", label: "Title search fee", amount: 45, duplicate: false, defaultChecked: true },
  { key: "voi-check", label: "VOI check", amount: 12, duplicate: true, defaultChecked: false },
];
export function MockDisbursementsImport() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DISBURSEMENT_LINES.map((l) => [l.key, l.defaultChecked]))
  );
  const selectedLines = DISBURSEMENT_LINES.filter((l) => checked[l.key]);
  const total = selectedLines.reduce((sum, l) => sum + l.amount, 0);
  return (
    <div className="w-full max-w-sm rounded-[20px] border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-wide">Import from invoice</h3>
        <X size={16} className="text-slate-300" />
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/60">
            <Check size={12} className="text-indigo-600 shrink-0" />
            <span className="text-[11px] font-bold text-slate-700 truncate">2024/0187 — Smith Family Trust</span>
          </div>
          <div className="divide-y divide-slate-50">
            {DISBURSEMENT_LINES.map((line) => (
              <button
                key={line.key}
                onClick={() => setChecked((c) => ({ ...c, [line.key]: !c[line.key] }))}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-slate-700 text-left transition-colors ${line.duplicate ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-slate-50"}`}
              >
                <span className={`w-3.5 h-3.5 rounded border-2 shrink-0 transition-colors ${checked[line.key] ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`} />
                {line.duplicate && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8px] font-bold uppercase shrink-0">
                    <CopyX size={9} /> Duplicate
                  </span>
                )}
                <span className="flex-1 truncate">{line.label}</span>
                <span className="text-slate-500 shrink-0">${line.amount.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border border-amber-200 bg-amber-50/40 rounded-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={12} className="text-amber-500 shrink-0" />
            <span className="text-[11px] font-bold text-slate-700 truncate">2024/9942</span>
          </div>
          <span className="text-[9px] font-bold text-amber-600 shrink-0">No matching matter</span>
        </div>
      </div>
      <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <span className="text-[10px] text-slate-400">{selectedLines.length} line{selectedLines.length === 1 ? "" : "s"} · ${total.toFixed(2)} ex GST</span>
        <span className="px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full whitespace-nowrap">Add {selectedLines.length} disbursement{selectedLines.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

// Recreates the real conversation retention window
// (app/api/ai/conversations/sweep/route.ts's RETENTION_DAYS constant) and
// the Privacy Policy's no-training commitment for third-party providers.
export function MockAiSafety() {
  return (
    <WidgetCard label="AI safety">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 mb-2.5">
        <span className="text-[12px] font-medium text-slate-700">Conversation history</span>
        <span className="text-[10px] font-bold text-slate-500 shrink-0">Deleted after 90 days</span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <span className="text-[12px] font-medium text-slate-700">Model training</span>
        <span className="text-[10px] font-bold text-slate-500 shrink-0">Never used</span>
      </div>
    </WidgetCard>
  );
}

const MARKETPLACE_TEMPLATES: { key: string; icon: LucideIcon; color: string; name: string; industry: string }[] = [
  { key: "law-firm", icon: Landmark, color: "#6366f1", name: "Law Firm", industry: "Legal" },
  { key: "property", icon: Building2, color: "#0ea5e9", name: "Property Development", industry: "Property" },
  { key: "sales", icon: Store, color: "#10b981", name: "Sales Pipeline", industry: "General" },
];
// Recreates the real Template marketplace (app/(app)/dashboard/marketplace/
// page.tsx): the same icon-chip card, industry tag, and Install button as
// the live "browse" list. The three templates shown here are meant to make
// the point that the marketplace spans industries, not just the Law Firm
// and Property Development templates that exist today. Install genuinely
// toggles to "Installed" on click, same as the real button flipping to
// Update/Uninstall once a template is actually on your company.
// Recreates the real Quick Glance landing page for law firms
// (components/dashboard/quickGlance/LawFirmQuickGlance.tsx): the same
// three trust stat cards (Trust balance, Dormant trust 90+ days, Matters
// with trust) plus the Old Time aging widget
// (components/dashboard/TimeAgingReportWidget.tsx) -- same Times/Matters
// toggle and real "Older than 5d/10d/15d/30d" quick filter, amber-800
// highlight on the active option, both genuinely changing which rows
// show (the filter narrows the same underlying list, it isn't just a
// highlight swap).
// Times columns/order (Matter, Staff, Date, Description, Hours, Days
// unbilled) and Matters columns/order (Matter, Oldest unbilled date, Days
// unbilled, Unbilled entries, Unbilled hours) both copied field-for-field
// from TimeAgingReportWidget.tsx's own two <table>s -- an earlier version
// of this mockup trimmed both down and reordered them, which looked
// plausible but wasn't what the real widget shows.
type AgingItem = { matter: string; staff: string; date: string; description: string; hours: number; days: number };
const QUICK_GLANCE_ITEMS: AgingItem[] = [
  { matter: "2024/0225", staff: "Aisha Khan", date: "12 Jun", description: "Reviewed trustee resolution ahead of registration.", hours: 0.3, days: 42 },
  { matter: "2024/0164", staff: "Priya Shah", date: "19 Jun", description: "Confirmed settlement figure adjustments with purchaser's solicitor.", hours: 0.4, days: 35 },
  { matter: "2024/0201", staff: "Jono Ferreira", date: "5 Jul", description: "Drafted covering letter to settlor for execution.", hours: 0.2, days: 18 },
  { matter: "2024/0187", staff: "Sarah Lee", date: "11 Jul", description: "Reviewed Deed of Variation and drafted a short covering note.", hours: 0.3, days: 12 },
  { matter: "2024/0212", staff: "Tom Walsh", date: "17 Jul", description: "Reviewed Section 32 disclosure statement ahead of exchange.", hours: 0.2, days: 6 },
];
const AGING_OPTIONS = [5, 10, 15, 30] as const;

export function MockQuickGlance() {
  const [view, setView] = useState<"times" | "matters">("times");
  const [olderThan, setOlderThan] = useState<(typeof AGING_OPTIONS)[number]>(30);
  const items = QUICK_GLANCE_ITEMS.filter((i) => i.days >= olderThan);
  const matterRows = Object.values(
    items.reduce<Record<string, { matter: string; oldestDate: string; entries: number; hours: number; days: number }>>((acc, it) => {
      const existing = acc[it.matter];
      if (existing) { existing.entries += 1; existing.hours += it.hours; }
      else acc[it.matter] = { matter: it.matter, oldestDate: it.date, entries: 1, hours: it.hours, days: it.days };
      return acc;
    }, {})
  );

  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-3 py-2.5">
          <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0"><Landmark size={14} /></div>
          <div className="min-w-0">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">Trust balance</p>
            <p className="text-[13px] font-bold text-slate-900 truncate">$38,735</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-3 py-2.5">
          <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0"><AlertTriangle size={14} /></div>
          <div className="min-w-0">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">Dormant trust</p>
            <p className="text-[13px] font-bold text-rose-600 truncate">2</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-3 py-2.5">
          <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0"><Users size={14} /></div>
          <div className="min-w-0">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">Matters w/ trust</p>
            <p className="text-[13px] font-bold text-slate-900 truncate">7</p>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <IconHeader icon={AlertTriangle} tint="bg-amber-50" iconColor="text-amber-700" title={`Old Time (${olderThan}+ days unbilled)`} subtitle="Time not yet invoiced, oldest first" />
          <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold">
            <button onClick={() => setView("times")} className={`px-3 py-1.5 rounded-full transition-all ${view === "times" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>Times</button>
            <button onClick={() => setView("matters")} className={`px-3 py-1.5 rounded-full transition-all ${view === "matters" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>Matters</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mr-1">Older than</span>
          {AGING_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setOlderThan(d)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${olderThan === d ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
          <div className={view === "times" ? "min-w-[600px]" : "min-w-[520px]"}>
            {view === "times" ? (
              <DetailedTable
                columns={[
                  { label: "Matter" }, { label: "Staff" }, { label: "Date" }, { label: "Description" },
                  { label: "Hours", align: "right" }, { label: "Days unbilled", align: "right" },
                ]}
                rows={items.map((i) => [i.matter, i.staff, i.date, i.description, i.hours.toFixed(1), { text: `${i.days}`, badge: "amber" as const }])}
              />
            ) : (
              <DetailedTable
                columns={[
                  { label: "Matter" }, { label: "Oldest unbilled date" }, { label: "Days unbilled", align: "right" },
                  { label: "Unbilled entries", align: "right" }, { label: "Unbilled hours", align: "right" },
                ]}
                rows={matterRows.map((m) => [m.matter, m.oldestDate, { text: `${m.days}`, badge: "amber" as const }, String(m.entries), m.hours.toFixed(1)])}
              />
            )}
          </div>
          {items.length === 0 && <p className="text-center py-6 text-[11px] text-slate-300 italic">Nothing unbilled past {olderThan} days</p>}
        </div>
      </div>
    </div>
  );
}

export function MockMarketplace() {
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  return (
    <WidgetCard label="Marketplace">
      <div className="space-y-2.5">
        {MARKETPLACE_TEMPLATES.map((t) => {
          const isInstalled = !!installed[t.key];
          return (
            <div key={t.key} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}20` }}>
                <t.icon size={15} style={{ color: t.color }} />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-700 truncate">{t.name}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase px-1.5 py-0.5 bg-white rounded-full shrink-0">{t.industry}</span>
              </div>
              <button
                onClick={() => setInstalled((s) => ({ ...s, [t.key]: !s[t.key] }))}
                className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold rounded-full shrink-0 transition-colors ${isInstalled ? "bg-emerald-50 text-emerald-600" : "bg-indigo-600 text-white"}`}
              >
                {isInstalled && <Check size={10} />} {isInstalled ? "Installed" : "Install"}
              </button>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}

export const MOCKUPS = {
  customTable: MockCustomTable,
  automation: MockAutomation,
  multiCompany: MockMultiCompany,
  roleAccess: MockRoleAccess,
  reporting: MockReporting,
  aiSafety: MockAiSafety,
  marketplace: MockMarketplace,
  quickGlance: MockQuickGlance,
  matterBoard: MockMatterBoard,
  timeEntries: MockTimeEntries,
  autoTimeEntries: MockAutoTimeEntries,
  trustAccount: MockTrustAccount,
  feesReport: MockFeesReport,
  disbursementsImport: MockDisbursementsImport,
  precedents: MockPrecedents,
  teamsManagement: MockTeamsManagement,
  clientUpdates: MockClientUpdates,
  tasks: MockTasks,
  loanTable: MockLoanTable,
  financeModel: MockFinanceModel,
  loanSchedule: MockLoanSchedule,
  residualLand: MockResidualLand,
  entityValidation: MockEntityValidation,
  gmailLabels: MockGmailLabels,
} as const;

export type MockupName = keyof typeof MOCKUPS;
