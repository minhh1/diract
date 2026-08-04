// app/public/finance-model/[pageId]/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/PublicFinanceModelContent.tsx, shared with
// components/dashboard/tabs/FinanceModelTab.tsx so the record tab and this
// public link never render differently. GENUINELY UNAUTHENTICATED -- see
// that component's doc comment.
"use client";

import { useParams } from "next/navigation";
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";

export default function PublicFinanceModelPage() {
  const params = useParams();
  const pageId = params.pageId as string;
  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <PublicFinanceModelContent pageId={pageId} mode="public" />
      </div>
    </div>
  );
}
