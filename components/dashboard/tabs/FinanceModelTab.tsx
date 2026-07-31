"use client";

// The "Finance Model" tab -- thin wrapper around the shared
// PublicFinanceModelContent (same "one rendering, two call sites" pattern
// as components/dashboard/ClientUpdatePageWidget.tsx wrapping
// PublicClientUpdateContent), so this tab and the public shareable link
// (app/public/finance-model/[pageId]) never drift apart. Project-scoped,
// not entity-scoped -- a single entity (SPV company) can hold several
// projects (e.g. two units under one title), each needing its own budget.
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";

interface Props {
  recordId: string; // project id
}

export default function FinanceModelTab({ recordId }: Props) {
  return <PublicFinanceModelContent projectId={recordId} mode="internal" embedded />;
}
