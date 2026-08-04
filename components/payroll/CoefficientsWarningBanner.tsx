// components/payroll/CoefficientsWarningBanner.tsx
// Rendered on every payroll page (Run Pay review screen, payslip view) --
// not a code comment nobody sees. Reads COEFFICIENTS_VERIFIED_AT from
// lib/payroll/withholdingCoefficients.ts directly, so this stops rendering
// on its own the day someone actually checks the coefficients against the
// live ATO NAT 1004 document and sets that flag -- no second place to
// remember to update.
import { AlertTriangle } from "lucide-react";
import { COEFFICIENTS_VERIFIED_AT, COEFFICIENTS_SOURCE_URL } from "@/lib/payroll/withholdingCoefficients";

export default function CoefficientsWarningBanner() {
  if (COEFFICIENTS_VERIFIED_AT) return null;

  return (
    <div className="flex items-start gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100 shrink-0">
      <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
      <p className="text-[12px] font-medium text-amber-800 flex-1">
        Tax withholding coefficients are <strong>not verified as current</strong>. Confirm them against the
        live{" "}
        <a href={COEFFICIENTS_SOURCE_URL} target="_blank" rel="noreferrer" className="underline hover:text-amber-900">
          ATO NAT 1004 Schedule 1
        </a>{" "}
        before relying on this for a real, paid pay run.
      </p>
    </div>
  );
}
