"use client";

// The rich deep-dive page for "Entity data validation" -- same real
// checksum validators as the Trust page's field-validation section
// (lib/validation/entityValidation.ts, wired into components/
// NewEntityModal.tsx and components/RecordEditModal.tsx), framed for a
// property developer's entity structures rather than a law firm's.
import { BadgeCheck } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { FieldRow } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

export default function EntityValidationDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={BadgeCheck}
          badgeText="Entity data validation"
          badgeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
          headlineLines={["Bad entity data caught", "before it's in a deal."]}
          accentClass="text-emerald-600"
          subheadline="Development deals run through special purpose vehicles, trusts, and joint ventures, so a wrong digit in an ABN is a real problem. It's checked the moment it's typed, on every entity, not just at signup."
        />

        <Section eyebrow="Validation" eyebrowClass="text-emerald-500" title="A real checksum, not a length check">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            ABN runs the actual ATO modulus-89 checksum, and ACN runs ASIC's weighted check-digit formula. Both are flagged
            immediately if they don't add up, on creation and on every later edit. BSB and account number are checked too,
            at 6 digits and 4 to 10 digits respectively, catching a mistyped digit count on the spot.
          </p>
          <div className={`space-y-2 max-w-sm ${isDark ? "dark" : ""}`}>
            <FieldRow label="Entity" value="Riverside Development Pty Ltd" />
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
