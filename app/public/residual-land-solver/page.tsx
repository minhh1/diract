// app/public/residual-land-solver/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/ResidualLandSolverContent.tsx, shared with
// components/dashboard/tabs/ResidualLandSolverTab.tsx. GENUINELY
// UNAUTHENTICATED and, unlike /public/finance-model/[pageId], deliberately
// ungated: with no projectId the component fetches and persists nothing --
// it's a pure client-side calculator, so there's no data to protect.
"use client";

import ResidualLandSolverContent from "@/components/public/ResidualLandSolverContent";

export default function PublicResidualLandSolverPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <ResidualLandSolverContent />
      </div>
    </div>
  );
}
