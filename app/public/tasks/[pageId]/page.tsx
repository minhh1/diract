// app/public/tasks/[pageId]/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/PublicTasksContent.tsx, shared with
// components/dashboard/PublicTaskPageWidget.tsx so a dashboard can render
// the same task report inline instead of just linking out to this page.
"use client";

import { useParams } from "next/navigation";
import PublicTasksContent from "@/components/public/PublicTasksContent";

export default function PublicTaskPage() {
  const params = useParams();
  const pageId = params.pageId as string;
  return <PublicTasksContent pageId={pageId} />;
}
