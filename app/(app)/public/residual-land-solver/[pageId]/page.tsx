// app/public/residual-land-solver/[pageId]/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/ResidualLandSolverContent.tsx, shared with the
// dashboard tab and the ungated /public/residual-land-solver calculator.
// GENUINELY UNAUTHENTICATED, access-code gated: this is a customer link
// issued from the solver tab's Share panel, and it's what lets the
// customer save named calculations server-side and get them back later
// (app/api/residual-land-solver-pages/public/[pageId]/route.ts).
"use client";

import { useParams } from "next/navigation";
import ResidualLandSolverContent from "@/components/public/ResidualLandSolverContent";

export default function SharedResidualLandSolverPage() {
  const params = useParams();
  const pageId = params.pageId as string;
  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <ResidualLandSolverContent pageId={pageId} />
      </div>
    </div>
  );
}
