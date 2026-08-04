// A library of marketing "product photo" mockups. These are pixel-faithful
// recreations of real, currently-shipping screens (verified by reading the
// actual component source directly, not paraphrased) -- exact column
// headers/order, exact copy, exact real feature names, exact chart colors.
// Only the DATA is invented (there's no real customer data to show); the
// structure and wording are not. Sources, one per mockup, are named in each
// function's own comment. All utility classes here are ones app/globals.css's
// `.dark` block already remaps, so wrapping any of these in a
// `<div className="dark">` (see MockupThemeProvider.tsx) renders correctly
// in dark mode for free -- except where noted (border-l-* has a real,
// pre-existing gap in the app's own dark CSS, see MockClientUpdates).
import type { ReactNode } from "react";
import {
  Check, AlertTriangle, X, FileText, Clock, PenSquare, ChevronDown,
  FileOutput, Users, Crown, Calendar, type LucideIcon,
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
function WidgetCard({ label, children }: { label: string; children: ReactNode }) {
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
function IconHeader({ icon: Icon, tint, iconColor, title, subtitle }: { icon: LucideIcon; tint: string; iconColor: string; title: string; subtitle: string }) {
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
function DetailedTable({
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
function Bars({ values }: { values: number[] }) {
  return (
    <div className="flex items-end justify-center gap-[2px] h-20 px-1">
      {values.map((v, i) => (
        <div key={i} className="flex-1 max-w-[24px] rounded-t" style={{ height: `${v}%`, backgroundColor: "#3987e5", minHeight: 2 }} />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">{label}</p>
      <p className="text-lg font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Checklist({ items }: { items: { label: string; ok: boolean }[] }) {
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

// ── Home page (generic CRM) ─────────────────────────────────────────────

function MockCustomTable() {
  return (
    <TableFrame
      label="Pipeline"
      columns={["Record", "Owner", "Status"]}
      rows={[
        ["Acme Onboarding", "J. Ferreira", { text: "On track", badge: "indigo" }],
        ["Beta Co Renewal", "S. Lee", { text: "Blocked", badge: "amber" }],
        ["Support Escalation", "M. Huynh", { text: "Complete", badge: "emerald" }],
        ["Vendor Review", "J. Ferreira", { text: "On track", badge: "indigo" }],
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
function MockAutomation() {
  return (
    <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white shadow-sm p-5">
      <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-wide mb-2">Auto-add rules</h3>
      <p className="text-[11px] text-slate-400 mb-3">
        When a new record is created with a matching field value, it's added here automatically.
      </p>
      <div className="space-y-2">
        <div className="px-4 py-2.5 bg-slate-50 rounded-2xl text-[12px] text-slate-600">
          <span className="font-bold text-slate-800">Status</span> is "Settled"
        </div>
        <div className="px-4 py-2.5 bg-slate-50 rounded-2xl text-[12px] text-slate-600">
          <span className="font-bold text-slate-800">Record type</span> contains "Trust"
        </div>
        <div className="px-4 py-2.5 bg-slate-50 rounded-2xl text-[12px] text-slate-600">
          <span className="font-bold text-slate-800">Priority</span> is "Urgent"
        </div>
      </div>
    </div>
  );
}

function MockMultiCompany() {
  return (
    <TableFrame
      label="Companies"
      columns={["Company", "Status"]}
      rows={[
        ["Acme Pty Ltd", { text: "Active", badge: "indigo" }],
        ["Beta Holdings", { text: "Member", badge: "slate" }],
        ["Gamma Group", { text: "Member", badge: "slate" }],
      ]}
    />
  );
}

function MockRoleAccess() {
  return (
    <TableFrame
      label="Team"
      columns={["Name", "Role"]}
      rows={[
        ["Minh Huynh", { text: "Admin", badge: "indigo" }],
        ["Sarah Lee", { text: "Member", badge: "sky" }],
        ["Guest Reviewer", { text: "Viewer", badge: "slate" }],
      ]}
    />
  );
}

function MockReporting() {
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

function MockMatterBoard() {
  return (
    <TableFrame
      label="Matters"
      columns={["Matter", "Status"]}
      rows={[
        ["2024/0187 — Smith Family Trust", { text: "In progress", badge: "indigo" }],
        ["2024/0201 — Nguyen Trust Deed", { text: "Awaiting docs", badge: "amber" }],
        ["2024/0164 — Harbord Property Co.", { text: "Settled", badge: "emerald" }],
        ["2024/0212 — 88 Riverside Ave", { text: "In progress", badge: "indigo" }],
      ]}
    />
  );
}

function MockTimeEntries() {
  return (
    <TableFrame
      label="Time entries"
      columns={["Matter", "Date", "Hours"]}
      rows={[
        ["2024/0187 — Smith Family Trust", "22 Jul", "2.4h"],
        ["2024/0201 — Nguyen Trust Deed", "22 Jul", "1.0h"],
        ["2024/0164 — Harbord Property Co.", "21 Jul", "0.5h"],
      ]}
    />
  );
}

// A faithful, near-1:1 recreation of the real drawer
// (components/dashboard/AutoTimeRecordingPanel.tsx): same header/close,
// same settings-row order (date + scope toggle, then description
// detail-level toggle) sitting above the entry list, same per-entry shape
// (timekeeper initials, matter label, editable-looking description box,
// hours pill, email count). Example content is real-sounding legal
// drafting wording against real-shaped matter numbers.
function MockAutoTimeEntries() {
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
        <div className="border border-slate-200 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold flex items-center justify-center shrink-0">MH</span>
            <span className="text-[10px] text-slate-400 font-medium">22 Jul</span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] font-bold text-slate-500">Matter: 2024/0187 — Smith Family Trust</span>
          </div>
          <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
            Reviewed and finalised Deed of Variation; drafted correspondence to trustee regarding execution requirements.
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700">1.4</span>
            <span className="text-[10px] text-slate-400 font-medium">hours</span>
            <span className="ml-auto text-[10px] font-bold text-indigo-500">3 emails</span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold flex items-center justify-center shrink-0">SL</span>
            <span className="text-[10px] text-slate-400 font-medium">22 Jul</span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] font-bold text-slate-500">Matter: 2024/0212 — 88 Riverside Ave</span>
          </div>
          <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
            Prepared Section 32 disclosure statement; liaised with vendor's conveyancer regarding special conditions.
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700">0.8</span>
            <span className="text-[10px] text-slate-400 font-medium">hours</span>
            <span className="ml-auto text-[10px] font-bold text-indigo-500">1 email</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <div className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold">
          Submit 2 selected
        </div>
      </div>
    </div>
  );
}

// Recreates components/dashboard/TrustLedgerStatementWidget.tsx exactly:
// violet FileText icon-header with its real title/subtitle copy, the real
// 7-column table (Date, Receipt No., Type, Particulars, In, Out, running
// Balance per row -- not a simplified 2-column version), and its real
// footer ("Totals" spanning the first 4 columns, then In/Out/Balance
// totals).
function MockTrustAccount() {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={FileText} tint="bg-violet-50" iconColor="text-violet-700" title="Trust Ledger Statement" subtitle="Every transaction for one matter, with running balance" />
      <div className="rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <DetailedTable
          columns={[
            { label: "Date" }, { label: "Receipt No." }, { label: "Type" }, { label: "Particulars" },
            { label: "In", align: "right" }, { label: "Out", align: "right" }, { label: "Balance", align: "right" },
          ]}
          rows={[
            ["12 Jun", "TR-0442", "Receipt", "Deposit received", "$45,000", "—", "$45,000"],
            ["18 Jun", "—", "Disbursement", "Search fees", "—", "$220", "$44,780"],
            ["03 Jul", "—", "Disbursement", "Stamp duty", "—", "$18,400", "$26,380"],
          ]}
          footer={[
            { text: "Totals", colSpan: 4 },
            { text: "$45,000", align: "right" },
            { text: "$18,620", align: "right" },
            { text: "$26,380", align: "right" },
          ]}
        />
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
function MockFeesReport() {
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
            ["M. Huynh", "62", "38.5", "35.0", "$14,250"],
            ["S. Lee", "54", "31.0", "28.5", "$9,920"],
            ["J. Ferreira", "41", "27.5", "24.0", "$8,470"],
          ]}
          footer={[
            { text: "Total" },
            { text: "157", align: "right" },
            { text: "97.0", align: "right" },
            { text: "87.5", align: "right" },
            { text: "$32,640", align: "right" },
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
function MockPrecedents() {
  return (
    <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5">
        <ChevronDown size={13} className="text-slate-400" />
        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Property</span>
        <span className="text-[10px] text-slate-400 ml-auto">2</span>
      </div>
      <div className="px-3 pb-3 space-y-1.5">
        <div className="flex items-center gap-3 p-3.5 bg-slate-50/60 rounded-[18px]">
          <PenSquare size={15} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[12.5px] font-bold text-slate-800">Contract of Sale</p>
              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[9px] font-bold">VIC</span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold">
                <Calendar size={9} /> Prepared 12/03/2026
              </span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">
                <AlertTriangle size={9} /> Check before use
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Standard residential contract, general conditions</p>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full shrink-0">
            <FileOutput size={13} /> Issue
          </button>
        </div>
        <div className="flex items-center gap-3 p-3.5 bg-slate-50/60 rounded-[18px]">
          <PenSquare size={15} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[12.5px] font-bold text-slate-800">Deed of Trust</p>
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold">
                <Calendar size={9} /> Prepared 04/06/2026
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Discretionary trust deed template</p>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full shrink-0">
            <FileOutput size={13} /> Issue
          </button>
        </div>
      </div>
    </div>
  );
}

// Recreates components/admin/AdminTeamsTab.tsx exactly: Users icon at its
// real size (14), team name at its real size (13px), the real member row
// (avatar initial, name, email) and the real leader treatment -- a Crown
// icon WITH its "Leader" text label, not just a bare icon.
function MockTeamsManagement() {
  return (
    <div className="w-full max-w-sm rounded-[32px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 border-b border-slate-100">
        <Users size={14} className="text-indigo-500 shrink-0" />
        <span className="text-[13px] font-bold text-slate-800 flex-1">Property Team</span>
        <span className="text-[10px] text-slate-400">6 members</span>
      </div>
      <div>
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-50">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">M</div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-slate-800 truncate">Minh Huynh</p>
            <p className="text-[10px] text-slate-400 truncate">minh@firm.com.au</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold shrink-0">
            <Crown size={11} /> Leader
          </span>
        </div>
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-50">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">S</div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-slate-800 truncate">Sarah Lee</p>
            <p className="text-[10px] text-slate-400 truncate">sarah@firm.com.au</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-6 py-3">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">J</div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-slate-800 truncate">Jono Ferreira</p>
            <p className="text-[10px] text-slate-400 truncate">jono@firm.com.au</p>
          </div>
        </div>
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
function MockClientUpdates() {
  return (
    <div className="w-full max-w-sm space-y-2.5">
      <div className="border rounded-2xl border-l-4 border-l-amber-400 bg-amber-50/40 border-y-slate-200 border-r-slate-200">
        <div className="px-4 py-3">
          <p className="text-[12px] font-medium text-slate-700">2024/0201 — Nguyen Trust Deed</p>
        </div>
      </div>
      <div className="border rounded-2xl border-l-4 border-l-blue-400 bg-blue-50/40 border-y-slate-200 border-r-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[12px] font-medium text-slate-700">2024/0212 — 88 Riverside Ave</p>
          <p className="text-[11px] text-slate-400 italic mt-0.5">Contract exchanged; awaiting finance approval before booking settlement.</p>
        </div>
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
      </div>
      <div className="border rounded-2xl border-l-4 border-l-emerald-400 bg-emerald-50/40 border-y-slate-200 border-r-slate-200">
        <div className="px-4 py-3">
          <p className="text-[12px] font-medium text-slate-700">2024/0187 — Smith Family Trust</p>
        </div>
      </div>
    </div>
  );
}

// Tasks has no kanban/board in the real app -- app/(app)/dashboard/tasks
// just renders the same GenericMasterTable every other table does, so this
// reuses TableFrame rather than inventing a drag-drop board that doesn't
// exist in the product. Matter refs shortened to just the matter number
// (no name) -- the full "task + matter name + status" combination doesn't
// fit a max-w-sm card without the last column clipping.
function MockTasks() {
  return (
    <TableFrame
      label="Tasks"
      columns={["Task", "Matter", "Due"]}
      rows={[
        ["Order title search", "2024/0212", { text: "Today", badge: "amber" }],
        ["Draft contract", "2024/0187", { text: "23 Jul", badge: "indigo" }],
        ["Send engagement letter", "2024/0201", { text: "Done", badge: "emerald" }],
      ]}
    />
  );
}

// ── Property developers (AU) ────────────────────────────────────────────

function MockLoanTable() {
  return (
    <TableFrame
      label="Loan facilities"
      columns={["Facility", "Limit", "Drawn"]}
      rows={[
        ["Westpac — Construction", "$4.2M", { text: "60%", badge: "indigo" }],
        ["ANZ — Land facility", "$1.8M", { text: "100%", badge: "sky" }],
        ["Private — Mezzanine", "$650k", { text: "Undrawn", badge: "amber" }],
      ]}
    />
  );
}

function MockFinanceModel() {
  return (
    <WidgetCard label="Finance model">
      <Bars values={[80, 45, 35]} />
      <div className="mt-4">
        <Stat label="Projected margin" value="18.4%" />
      </div>
    </WidgetCard>
  );
}

function MockLoanSchedule() {
  return (
    <TableFrame
      label="Loan schedule"
      columns={["Period", "Drawdown", "Interest"]}
      rows={[
        ["Q1", "$1.2M", "$18k"],
        ["Q2", "$0.9M", "$32k"],
        ["Q3", "$0.6M", "$41k"],
      ]}
    />
  );
}

function MockResidualLand() {
  return (
    <WidgetCard label="Residual land solver">
      <Stat label="Residual land value" value="$2.14M" />
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-700">GRV</span>
          <span className="text-[12px] font-semibold text-slate-500">$8.6M</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-700">Total costs</span>
          <span className="text-[12px] font-semibold text-slate-500">$6.1M</span>
        </div>
      </div>
    </WidgetCard>
  );
}

function MockEntityValidation() {
  return (
    <WidgetCard label="Entity validation">
      <Checklist
        items={[
          { label: "ABN verified", ok: true },
          { label: "ACN verified", ok: true },
          { label: "Trust deed sighted", ok: true },
          { label: "Director ID pending", ok: false },
        ]}
      />
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
