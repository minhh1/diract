"use client";

// The "Residual Land Solver" tab -- thin wrapper around the shared
// ResidualLandSolverContent (same "one rendering, multiple call sites"
// pattern as FinanceModelTab.tsx wrapping PublicFinanceModelContent), so
// this tab and the public calculator (app/public/residual-land-solver)
// never drift apart.
//
// Addable to ANY record's dashboard, but only a Project record has the
// feasibility-inputs row / property state / Finance Model settings the
// solver's persistence APIs are keyed to -- so projectId is only passed
// when the record actually IS a project. On every other record type the
// solver renders in standalone mode (fully functional, nothing persisted),
// rather than writing feasibility rows keyed to a non-project id.
import ResidualLandSolverContent from "@/components/public/ResidualLandSolverContent";

interface Props {
  recordId: string;
  isProject: boolean;
}

export default function ResidualLandSolverTab({ recordId, isProject }: Props) {
  return <ResidualLandSolverContent projectId={isProject ? recordId : undefined} />;
}
