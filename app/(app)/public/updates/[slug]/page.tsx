// app/public/updates/[slug]/page.tsx
// Thin route wrapper -- the actual UI lives in
// components/public/PublicClientUpdateContent.tsx, shared with
// components/dashboard/ClientUpdatePageWidget.tsx so a dashboard can
// render the same client-update board inline instead of just linking out
// to this page.
"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PublicClientUpdateContent from "@/components/public/PublicClientUpdateContent";

function ClientUpdatePageInner() {
  const params = useParams();
  const slug = params.slug as string;
  // ?itemId=<client_update_page_items.id> -- deep-links straight to that
  // irregularity's fix modal (e.g. from a notification, see
  // app/dashboard/notifications/page.tsx), bypassing whichever group/filter
  // it'd otherwise be hidden behind. Only meaningful on an auto_fed board;
  // MatterBoard itself no-ops it (via IrregularityFixModal's own pageId
  // check) if the item/page combination doesn't make sense.
  const searchParams = useSearchParams();
  const itemId = searchParams.get("itemId") ?? undefined;
  return <PublicClientUpdateContent slug={slug} initialFixItemId={itemId} />;
}

export default function ClientUpdatePage() {
  // useSearchParams() needs a Suspense boundary in this Next.js version --
  // isolated here rather than wrapping PublicClientUpdateContent itself,
  // since that component is also used embedded in a dashboard widget where
  // this query param (and the Suspense requirement it brings) doesn't apply.
  return (
    <Suspense fallback={null}>
      <ClientUpdatePageInner />
    </Suspense>
  );
}
