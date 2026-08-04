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
import type { ReactNode } from "react";
import {
  Check, AlertTriangle, X, FileText, Clock, PenSquare, ChevronDown,
  FileOutput, Users, Crown, Calendar, Printer, type LucideIcon,
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
// tracking-widest headers, tr border-b border-slate-50 rows.
function TableFrame({ label, columns, rows }: { label: string; columns: string[]; rows: Cell[][] }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400">
            {columns.map((c) => (
              <th key={c} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 text-[12px] font-medium text-slate-700 truncate">
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
// plain TableFrame above has.
export function DetailedTable({
  columns, rows, footer,
}: {
  columns: { label: string; align?: "right" }[];
  rows: Cell[][];
  footer?: { text: string; align?: "right"; colSpan?: number }[];
}) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-100">
          {columns.map((c) => (
            <th key={c.label} className={`px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-50 last:border-0">
            {row.map((cell, ci) => (
              <td key={ci} className={`px-3 py-2 text-[11px] font-medium text-slate-700 whitespace-nowrap ${columns[ci]?.align === "right" ? "text-right" : "text-left"}`}>
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
              <td key={ci} colSpan={cell.colSpan} className={`px-3 py-2 text-[11px] font-bold text-slate-900 whitespace-nowrap ${cell.align === "right" ? "text-right" : "text-left"}`}>
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
  return (
    <div className="flex items-end justify-center gap-[2px] h-20 px-1">
      {values.map((v, i) => (
        <div key={i} className="flex-1 max-w-[24px] rounded-t" style={{ height: `${v}%`, backgroundColor: "#3987e5", minHeight: 2 }} />
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

export function MockTimeEntries() {
  return (
    <TableFrame
      label="Time entries"
      columns={["Matter", "Date", "Hours"]}
      rows={[
        ["2024/0187 — Smith Family Trust", "22 Jul", "2.4h"],
        ["2024/0201 — Nguyen Trust Deed", "22 Jul", "1.0h"],
        ["2024/0164 — Harbord Property Co.", "21 Jul", "0.5h"],
        ["2024/0212 — 88 Riverside Ave", "21 Jul", "1.8h"],
        ["2024/0225 — Walsh Discretionary Trust", "20 Jul", "0.6h"],
      ]}
    />
  );
}

// The example entries shown by both the home-page drawer preview and the
// AI Time Entries deep-dive page (app/(marketing)/features/[slug]) -- kept
// as one shared array so both stay in sync.
export const AUTO_TIME_ENTRY_EXAMPLES = [
  { initials: "SL", date: "22 Jul", matter: "2024/0187 — Smith Family Trust", description: "Reviewed and finalised Deed of Variation; drafted correspondence to trustee regarding execution requirements.", hours: "1.4", emails: 3 },
  { initials: "JF", date: "22 Jul", matter: "2024/0212 — 88 Riverside Ave", description: "Prepared Section 32 disclosure statement; liaised with vendor's conveyancer regarding special conditions.", hours: "0.8", emails: 1 },
  { initials: "PS", date: "21 Jul", matter: "2024/0201 — Nguyen Trust Deed", description: "Drafted discretionary trust deed and covering letter to settlor for execution.", hours: "1.1", emails: 2 },
  { initials: "TW", date: "21 Jul", matter: "2024/0164 — Harbord Property Co.", description: "Attended to settlement figures and confirmed adjustments with purchaser's solicitor.", hours: "0.6", emails: 4 },
  { initials: "AK", date: "20 Jul", matter: "2024/0225 — Walsh Discretionary Trust", description: "Reviewed trustee resolution and updated register of beneficiaries.", hours: "0.5", emails: 1 },
];

// A faithful, near-1:1 recreation of the real drawer
// (components/dashboard/AutoTimeRecordingPanel.tsx): same header/close,
// same settings-row order (date + scope toggle, then description
// detail-level toggle) sitting above the entry list, same per-entry shape
// (timekeeper initials, matter label, editable-looking description box,
// hours pill, email count). Example content is real-sounding legal
// drafting wording against real-shaped matter numbers.
export function MockAutoTimeEntries() {
  return (
    <div className="w-full max-w-sm rounded-[20px] border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-wide">Auto Time Recording</h3>
        <X size={16} className="text-slate-300" />
      </div>

      <div className="flex items-center gap-2 px-5 pt-3">
        <span className="px-3 py-1.5 border border-slate-200 rounded-full text-[10px] font-bold text-slate-600">22 Jul 2026</span>
        <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[9px] font-bold">
          <span className="px-2.5 py-1 rounded-full bg-white text-indigo-600 shadow-sm">My day</span>
          <span className="px-2.5 py-1 rounded-full text-slate-400">Everyone's day (Admin)</span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 pt-3">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Descriptions</span>
        <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[9px] font-bold">
          <span className="px-2.5 py-1 rounded-full text-slate-400">Brief</span>
          <span className="px-2.5 py-1 rounded-full text-slate-400">Standard</span>
          <span className="px-2.5 py-1 rounded-full bg-white text-indigo-600 shadow-sm">Detailed</span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {AUTO_TIME_ENTRY_EXAMPLES.map((e) => (
          <div key={e.matter} className="border border-slate-200 rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold flex items-center justify-center shrink-0">{e.initials}</span>
              <span className="text-[10px] text-slate-400 font-medium">{e.date}</span>
              <span className="text-[10px] text-slate-400">·</span>
              <span className="text-[10px] font-bold text-slate-500">Matter: {e.matter}</span>
            </div>
            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
              {e.description}
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700">{e.hours}</span>
              <span className="text-[10px] text-slate-400 font-medium">hours</span>
              <span className="ml-auto text-[10px] font-bold text-indigo-500">{e.emails} email{e.emails !== 1 ? "s" : ""}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <div className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold">
          Submit 5 selected
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
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
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
// footer.
export function MockFeesReport() {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={Clock} tint="bg-indigo-50" iconColor="text-indigo-700" title="Time & Fees Report" subtitle="Time recorded per staff member · 2026-07-01 to 2026-07-31" />
      <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold w-fit mb-3">
        <span className="px-3 py-1.5 rounded-full text-slate-400">This week</span>
        <span className="px-3 py-1.5 rounded-full bg-white text-indigo-600 shadow-sm">This month</span>
        <span className="px-3 py-1.5 rounded-full text-slate-400">All time</span>
      </div>
      <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <DetailedTable
          columns={[
            { label: "Staff" }, { label: "Entries", align: "right" }, { label: "Hours", align: "right" },
            { label: "Billable hours", align: "right" }, { label: "Amount", align: "right" },
          ]}
          rows={[
            ["Sarah Lee", "62", "38.5", "35.0", "$14,250"],
            ["Jono Ferreira", "54", "31.0", "28.5", "$9,920"],
            ["Priya Shah", "41", "27.5", "24.0", "$8,470"],
            ["Tom Walsh", "33", "19.0", "17.0", "$6,180"],
            ["Aisha Khan", "28", "14.5", "13.0", "$4,930"],
          ]}
          footer={[
            { text: "Total" },
            { text: "218", align: "right" },
            { text: "130.5", align: "right" },
            { text: "117.5", align: "right" },
            { text: "$43,750", align: "right" },
          ]}
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
export function MockPrecedents() {
  const items = [
    { name: "Contract of Sale", jurisdiction: "VIC", prepared: "12/03/2026", warn: true, desc: "Standard residential contract, general conditions" },
    { name: "Discretionary Trust Deed", jurisdiction: null, prepared: "04/06/2026", warn: false, desc: "Discretionary trust deed template" },
    { name: "Section 32 Vendor Statement", jurisdiction: "VIC", prepared: "18/05/2026", warn: true, desc: "Vendor disclosure statement for established properties" },
    { name: "Commercial Lease Agreement", jurisdiction: "NSW", prepared: "02/07/2026", warn: false, desc: "Standard commercial lease with outgoings clause" },
    { name: "Vendor Finance Loan Agreement", jurisdiction: null, prepared: "15/01/2026", warn: true, desc: "Secured by caveat, standard interest terms" },
  ];
  return (
    <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5">
        <ChevronDown size={13} className="text-slate-400" />
        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Property</span>
        <span className="text-[10px] text-slate-400 ml-auto">{items.length}</span>
      </div>
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

export function MockClientUpdates() {
  const cards: { color: keyof typeof CLIENT_CARD_COLORS; matter: string; summary?: string; expanded?: boolean }[] = [
    { color: "amber", matter: "2024/0201 — Nguyen Trust Deed" },
    { color: "blue", matter: "2024/0212 — 88 Riverside Ave", summary: "Contract exchanged; awaiting finance approval before booking settlement.", expanded: true },
    { color: "emerald", matter: "2024/0187 — Smith Family Trust" },
    { color: "purple", matter: "2024/0225 — Walsh Discretionary Trust" },
    { color: "red", matter: "2024/0164 — Harbord Property Co." },
  ];
  return (
    <div className="w-full max-w-sm space-y-2.5">
      {cards.map((c) => (
        <div key={c.matter} className={`border rounded-2xl border-l-4 ${CLIENT_CARD_COLORS[c.color]} border-y-slate-200 border-r-slate-200 overflow-hidden`}>
          <div className={c.expanded ? "px-4 py-3 border-b border-slate-100" : "px-4 py-3"}>
            <p className="text-[12px] font-medium text-slate-700">{c.matter}</p>
            {c.summary && <p className="text-[11px] text-slate-400 italic mt-0.5">{c.summary}</p>}
          </div>
          {c.expanded && (
            <div className="px-4 py-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Stage</p>
                <p className="text-[12px] font-medium text-slate-700">Pre-settlement</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Settlement date</p>
                <p className="text-[12px] font-medium text-slate-700">14 Aug 2026</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Tasks has no kanban/board in the real app -- app/(app)/dashboard/tasks
// just renders the same GenericMasterTable every other table does, so this
// reuses TableFrame rather than inventing a drag-drop board that doesn't
// exist in the product. Matter refs shortened to just the matter number
// (no name) -- the full "task + matter name + status" combination doesn't
// fit a max-w-sm card without the last column clipping.
export function MockTasks() {
  return (
    <TableFrame
      label="Tasks"
      columns={["Task", "Matter", "Due"]}
      rows={[
        ["Order title search", "2024/0212", { text: "Today", badge: "amber" }],
        ["Draft contract", "2024/0187", { text: "23 Jul", badge: "indigo" }],
        ["Send engagement letter", "2024/0201", { text: "Done", badge: "emerald" }],
        ["Review PPSR", "2024/0164", { text: "24 Jul", badge: "indigo" }],
        ["Prepare trustee resolution", "2024/0225", { text: "25 Jul", badge: "indigo" }],
      ]}
    />
  );
}

// ── Property developers (AU) ────────────────────────────────────────────

export function MockLoanTable() {
  return (
    <TableFrame
      label="Loan facilities"
      columns={["Facility", "Limit", "Drawn"]}
      rows={[
        ["Westpac — Construction", "$4.2M", { text: "60%", badge: "indigo" }],
        ["ANZ — Land facility", "$1.8M", { text: "100%", badge: "sky" }],
        ["Private — Mezzanine", "$650k", { text: "Undrawn", badge: "amber" }],
        ["NAB — Working capital", "$500k", { text: "40%", badge: "indigo" }],
        ["CBA — Bank guarantee", "$300k", { text: "Undrawn", badge: "amber" }],
      ]}
    />
  );
}

export function MockFinanceModel() {
  return (
    <WidgetCard label="Finance model">
      <Bars values={[80, 62, 45, 38, 30]} />
      <div className="mt-4">
        <Stat label="Projected margin" value="18.4%" />
      </div>
    </WidgetCard>
  );
}

export function MockLoanSchedule() {
  return (
    <TableFrame
      label="Loan schedule"
      columns={["Period", "Drawdown", "Interest"]}
      rows={[
        ["Q1", "$1.2M", "$18k"],
        ["Q2", "$0.9M", "$32k"],
        ["Q3", "$0.6M", "$41k"],
        ["Q4", "$0.4M", "$46k"],
        ["Q5", "$0.2M", "$48k"],
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
        <FieldRow label="BSB" value="062-000" />
        <FieldRow label="Account no." value="1234 5678" />
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
  matterBoard: MockMatterBoard,
  timeEntries: MockTimeEntries,
  autoTimeEntries: MockAutoTimeEntries,
  trustAccount: MockTrustAccount,
  feesReport: MockFeesReport,
  precedents: MockPrecedents,
  teamsManagement: MockTeamsManagement,
  clientUpdates: MockClientUpdates,
  tasks: MockTasks,
  loanTable: MockLoanTable,
  financeModel: MockFinanceModel,
  loanSchedule: MockLoanSchedule,
  residualLand: MockResidualLand,
  entityValidation: MockEntityValidation,
} as const;

export type MockupName = keyof typeof MOCKUPS;
