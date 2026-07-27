// app/public/documents/[pageId]/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/PublicDocumentsContent.tsx, shared with
// components/dashboard/DocumentPublicPageWidget.tsx so a dashboard can
// render the same document-fill form inline instead of just linking out to
// this page. GENUINELY UNAUTHENTICATED -- see that component's doc comment.
"use client";

import { useParams } from "next/navigation";
import PublicDocumentsContent from "@/components/public/PublicDocumentsContent";

export default function PublicDocumentFillPage() {
  const params = useParams();
  const pageId = params.pageId as string;
  return <PublicDocumentsContent pageId={pageId} />;
}
