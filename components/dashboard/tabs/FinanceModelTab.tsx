"use client";

// The "Finance Model" entity tab -- thin wrapper around the shared
// PublicFinanceModelContent (same "one rendering, two call sites" pattern
// as components/dashboard/ClientUpdatePageWidget.tsx wrapping
// PublicClientUpdateContent), so this tab and the public shareable link
// (app/public/finance-model/[pageId], once built) never drift apart.
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";

interface Props {
  recordId: string; // entity id
}

export default function FinanceModelTab({ recordId }: Props) {
  return <PublicFinanceModelContent entityId={recordId} mode="internal" embedded />;
}
