"use client";

// The "Residual Land Solver" tab -- thin wrapper around the shared
// ResidualLandSolverContent (same "one rendering, two call sites" pattern
// as FinanceModelTab.tsx wrapping PublicFinanceModelContent), so this tab
// and the standalone public calculator (app/public/residual-land-solver)
// never drift apart. Project-scoped, like the Finance Model itself.
import ResidualLandSolverContent from "@/components/public/ResidualLandSolverContent";

interface Props {
  recordId: string; // project id
}

export default function ResidualLandSolverTab({ recordId }: Props) {
  return <ResidualLandSolverContent projectId={recordId} />;
}
