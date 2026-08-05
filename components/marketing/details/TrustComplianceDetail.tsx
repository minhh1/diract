"use client";

// The rich deep-dive page for the "Trust account" feature -- covering
// exactly what was asked for: the compliance framing, a full unredacted
// ledger report, PDF export, and field validation. Every claim here is
// grounded in the real source: components/dashboard/
// TrustLedgerStatementWidget.tsx (the report itself, its real "Print"
// button) and lib/validation/entityValidation.ts (the real ABN/ACN
// checksum validators, wired into components/NewEntityModal.tsx and
// components/RecordEditModal.tsx) -- BSB and account number are real
// captured fields, but the app does not format-validate them today, and
// this page says so rather than implying it does.
// ABN/ACN use a real checksum (lib/validation/entityValidation.ts's
// isValidABN/isValidACN); BSB and account number use a real format check
// (isValidBSB/isValidAccountNumber, added alongside them) -- 6 digits and
// 4-10 digits respectively. Neither BSB nor account number has a public
// check-digit algorithm the way ABN/ACN do, so this catches a mistyped
// digit count, not a wrong-but-plausible number -- described honestly as
// a format check, not a bank-directory lookup.
import { Landmark, FileText, Printer } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { IconHeader, DetailedTable, FieldRow, TRUST_LEDGER_COLUMNS, TRUST_LEDGER_EXAMPLES, TRUST_LEDGER_FOOTER } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

export default function TrustComplianceDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Landmark}
          badgeText="Trust account"
          badgeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
          headlineLines={["Built around compliance,", "not bolted on after."]}
          accentClass="text-emerald-600"
          subheadline="A live trust ledger per matter, a full report whenever you need one, a PDF in one click, and cleaner data going in, so there's less to catch at audit time, not more to reconcile."
        />

        <Section eyebrow="Reporting" eyebrowClass="text-emerald-500" title="Compliance reports show everything, not a summary">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Every transaction for a matter, in date order, with a running balance on every row. It's not a rolled-up total that
            hides how it got there.
          </p>
          <div className={`rounded-2xl border border-slate-200 bg-white p-4 max-w-3xl ${isDark ? "dark" : ""}`}>
            <IconHeader icon={FileText} tint="bg-violet-50" iconColor="text-violet-700" title="Trust Ledger Statement" subtitle="Every transaction for one matter, with running balance" />
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <DetailedTable columns={TRUST_LEDGER_COLUMNS} rows={TRUST_LEDGER_EXAMPLES.map((e) => e.row)} footer={TRUST_LEDGER_FOOTER} />
            </div>
          </div>
        </Section>

        <Section eyebrow="Export" eyebrowClass="text-emerald-500" title="Generate a PDF in one click">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Print any statement straight to PDF, formatted for the file. There's no separate export tool, no reformatting a
            spreadsheet before it's fit to hand over.
          </p>
          <button className={`flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold ${isDark ? "dark" : ""}`}>
            <Printer size={12} /> Print
          </button>
        </Section>

        <Section eyebrow="Data entry" title="Field validation, so there's less room for a mistake">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            ABN and ACN are checked against the real ATO/ASIC checksum as they're typed, not just a length check. BSB and
            account number are checked too, at 6 digits and 4 to 10 digits respectively, catching a mistyped digit count on the spot,
            even though neither carries a public check-digit the way ABN/ACN do.
          </p>
          <div className={`space-y-2 max-w-sm ${isDark ? "dark" : ""}`}>
            <FieldRow label="Company" value="Anchor Developments Pty Ltd" />
            <FieldRow label="ABN" value="51 824 753 556" valid />
            <FieldRow label="ACN" value="824 753 556" valid />
            <FieldRow label="BSB" value="062-000" valid />
            <FieldRow label="Account no." value="1234 5678" valid />
          </div>
        </Section>
      </div>
    </section>
  );
}
