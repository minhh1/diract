// A library of marketing "product photo" mockups, built to match the real
// app's actual component styling rather than an invented generic style --
// same table chrome as components/DataTable.tsx/MasterTable.tsx (bg-slate-50
// uppercase headers, border-slate-200/50 rows), the same drawer layout as
// components/dashboard/AutoTimeRecordingPanel.tsx, the same ledger/report
// shape as components/dashboard/TrustLedgerStatementWidget.tsx and
// TimeFeesReportWidget.tsx, the same category-card shape as
// components/precedents/PrecedentLibraryBrowser.tsx, the same team-card
// shape as components/admin/AdminTeamsTab.tsx, and the same colored-border
// card shape client updates render in (components/clientUpdatePages/
// MatterBoard.tsx's Cards mode). All utility classes here are ones
// app/globals.css's `.dark` block already remaps, so wrapping any of these
// in a `<div className="dark">` (see MockupThemeProvider.tsx) renders
// correctly in dark mode for free, the same way the real app's dark mode
// works -- no separate dark palette to hand-maintain here.
import type { ReactNode } from "react";
import {
  Check, AlertTriangle, X, Landmark, Clock, PenSquare, ChevronDown,
  FileOutput, Users, Crown, type LucideIcon,
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

// Card chrome for the non-table widgets (charts, checklist) -- same
// rounded-2xl/border-slate-200/shadow-sm language as TableFrame so every
// mockup reads as one consistent design system, just without a real table
// equivalent to copy.
function WidgetCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{label}</p>
      {children}
    </div>
  );
}

// The small icon-badge + title/subtitle header components like
// TrustLedgerStatementWidget.tsx and TimeFeesReportWidget.tsx put above
// their own table.
function IconHeader({ icon: Icon, tint, title, subtitle }: { icon: LucideIcon; tint: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`h-9 w-9 rounded-xl ${tint} flex items-center justify-center shrink-0`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-slate-800 truncate">{title}</p>
        <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
      </div>
    </div>
  );
}

// A richer table variant for the ledger/report widgets -- right-aligned
// numeric columns and a bold totals footer, matching
// TrustLedgerStatementWidget.tsx/TimeFeesReportWidget.tsx's real shape
// (plain TableFrame above doesn't have either).
function DetailedTable({ columns, rows, footer }: { columns: { label: string; align?: "right" }[]; rows: Cell[][]; footer?: string[] }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-100">
          {columns.map((c) => (
            <th key={c.label} className={`px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-50 last:border-0">
            {row.map((cell, ci) => (
              <td key={ci} className={`px-3 py-2 text-[11px] font-medium text-slate-700 ${columns[ci]?.align === "right" ? "text-right" : "text-left"}`}>
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
            {footer.map((text, ci) => (
              <td key={ci} className={`px-3 py-2 text-[11px] font-bold text-slate-900 ${columns[ci]?.align === "right" ? "text-right" : "text-left"}`}>
                {text}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function Bars({ values, color }: { values: number[]; color: string }) {
  return (
    <div className="flex items-end gap-2 h-20 px-1">
      {values.map((v, i) => (
        <div key={i} className={`flex-1 rounded-t-lg ${color}`} style={{ height: `${v}%` }} />
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

function MockAutomation() {
  return (
    <TableFrame
      label="Automations"
      columns={["Trigger", "Action", ""]}
      rows={[
        ["New record", "Assign to owner", { text: "Active", badge: "indigo" }],
        ["Status: Done", "Notify client", { text: "Active", badge: "indigo" }],
        ["Due date passed", "Flag overdue", { text: "Active", badge: "amber" }],
      ]}
    />
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
      <Bars values={[40, 65, 50, 85, 60]} color="bg-indigo-400" />
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

// The one flagship mockup built as a faithful, near-1:1 recreation of the
// real drawer (components/dashboard/AutoTimeRecordingPanel.tsx) rather than
// an invented layout: same header/close, same settings-row order (date +
// scope toggle, then description detail-level toggle) sitting above the
// entry list, same per-entry shape (timekeeper initials, matter label,
// editable-looking description box, hours pill, email count). Example
// content is real-sounding legal drafting wording against real-shaped
// matter numbers, per what an AU law firm's actual auto-generated time
// entries look like -- not generic placeholder text.
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

// Recreates components/dashboard/TrustLedgerStatementWidget.tsx's real
// shape: teal icon-header, then a table with separate In/Out columns and a
// bold closing-balance totals footer -- not a generic amount column.
function MockTrustAccount() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={Landmark} tint="bg-teal-50 text-teal-700" title="Trust ledger" subtitle="2024/0187 — Smith Family Trust" />
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <DetailedTable
          columns={[{ label: "Particulars" }, { label: "In", align: "right" }, { label: "Out", align: "right" }]}
          rows={[
            ["Trust receipt — deposit", "$45,000", "—"],
            ["Disbursement — search fees", "—", "$220"],
            ["Disbursement — stamp duty", "—", "$18,400"],
          ]}
          footer={["Closing balance", "", "$26,380"]}
        />
      </div>
    </div>
  );
}

// Recreates components/dashboard/TimeFeesReportWidget.tsx's real shape:
// indigo icon-header, a date-range pill toggle, then a staff-by-staff
// hours/amount table with a bold totals footer.
function MockFeesReport() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <IconHeader icon={Clock} tint="bg-indigo-50 text-indigo-700" title="Time & Fees Report" subtitle="1 Jul – 31 Jul 2026" />
      <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[9px] font-bold w-fit mb-3">
        <span className="px-2.5 py-1 rounded-full text-slate-400">Week</span>
        <span className="px-2.5 py-1 rounded-full bg-white text-indigo-600 shadow-sm">Month</span>
        <span className="px-2.5 py-1 rounded-full text-slate-400">Quarter</span>
      </div>
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <DetailedTable
          columns={[{ label: "Staff" }, { label: "Hours", align: "right" }, { label: "Amount", align: "right" }]}
          rows={[
            ["M. Huynh", "38.5", "$14,250"],
            ["S. Lee", "31.0", "$9,920"],
            ["J. Ferreira", "27.5", "$8,470"],
          ]}
          footer={["Total", "97.0", "$32,640"]}
        />
      </div>
    </div>
  );
}

// Recreates components/precedents/PrecedentLibraryBrowser.tsx's real
// shape: a collapsible category section (chevron + category name + count)
// containing precedent rows with an amber document icon, jurisdiction/
// warning pills, and an "Issue" pill button.
function MockPrecedents() {
  return (
    <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5">
        <ChevronDown size={14} className="text-slate-400" />
        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">Property</span>
        <span className="text-[10px] text-slate-400 ml-auto">3</span>
      </div>
      <div className="px-3 pb-3 space-y-2">
        <div className="flex items-start gap-3 p-3.5 bg-slate-50/60 rounded-[18px]">
          <PenSquare size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[12.5px] font-bold text-slate-800">Contract of Sale</span>
              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[9px] font-bold">VIC</span>
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">Check before use</span>
            </div>
            <p className="text-[11px] text-slate-400">Standard residential contract, general conditions</p>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
            <FileOutput size={11} /> Issue
          </span>
        </div>
        <div className="flex items-start gap-3 p-3.5 bg-slate-50/60 rounded-[18px]">
          <PenSquare size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[12.5px] font-bold text-slate-800">Deed of Trust</span>
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold">All states</span>
            </div>
            <p className="text-[11px] text-slate-400">Discretionary trust deed template</p>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
            <FileOutput size={11} /> Issue
          </span>
        </div>
      </div>
    </div>
  );
}

// Recreates components/admin/AdminTeamsTab.tsx's real shape: a team card
// with a header bar (icon, name, member count) over member rows (avatar
// initial, name/email, a crown on the team leader).
function MockTeamsManagement() {
  return (
    <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <Users size={15} className="text-indigo-500" />
        <span className="text-[12.5px] font-bold text-slate-800 flex-1">Property Team</span>
        <span className="text-[10px] text-slate-400">6 members</span>
      </div>
      <div>
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50">
          <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">M</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-slate-800 truncate">Minh Huynh</p>
            <p className="text-[10px] text-slate-400 truncate">minh@firm.com.au</p>
          </div>
          <Crown size={12} className="text-amber-500 shrink-0" />
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50">
          <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">S</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-slate-800 truncate">Sarah Lee</p>
            <p className="text-[10px] text-slate-400 truncate">sarah@firm.com.au</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5">
          <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">J</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-slate-800 truncate">Jono Ferreira</p>
            <p className="text-[10px] text-slate-400 truncate">jono@firm.com.au</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Recreates the client-facing Cards mode of components/clientUpdatePages/
// MatterBoard.tsx: colored left-accent cards keyed to status, one shown
// expanded with its field grid the way a client actually sees it. Uses an
// explicit bg-* accent bar rather than border-l-*: app/globals.css's `.dark`
// block only remaps whole-side border utilities like `.border-amber-400`,
// not the left-only `.border-l-amber-400` variant, so a border-l accent
// would silently stay unthemed in the dark preview.
function MockClientUpdates() {
  return (
    <div className="w-full max-w-sm space-y-2.5">
      <div className="flex rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="w-1 bg-amber-400 shrink-0" />
        <div className="px-4 py-3 flex-1">
          <span className="text-[12px] font-medium text-slate-700">2024/0201 — Nguyen Trust Deed</span>
        </div>
      </div>
      <div className="flex rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="w-1 bg-indigo-400 shrink-0" />
        <div className="flex-1">
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[12px] font-medium text-slate-700">2024/0212 — 88 Riverside Ave</span>
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
      </div>
      <div className="flex rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="w-1 bg-emerald-500 shrink-0" />
        <div className="px-4 py-3 flex-1">
          <span className="text-[12px] font-medium text-slate-700">2024/0187 — Smith Family Trust</span>
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
      <Bars values={[80, 45, 35]} color="bg-indigo-400" />
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
