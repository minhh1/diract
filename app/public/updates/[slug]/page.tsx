// app/public/updates/[slug]/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/PublicClientUpdateContent.tsx, shared with
// components/dashboard/ClientUpdatePageWidget.tsx so a dashboard can
// render the same client-update board inline instead of just linking out
// to this page.
"use client";

import { useParams } from "next/navigation";
import PublicClientUpdateContent from "@/components/public/PublicClientUpdateContent";

export default function ClientUpdatePage() {
  const params = useParams();
  const slug = params.slug as string;
  return <PublicClientUpdateContent slug={slug} />;
}
