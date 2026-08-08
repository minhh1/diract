// app/public/events/[slug]/page.tsx
// Thin route wrapper, same shape as app/public/updates/[slug]/page.tsx --
// the actual UI lives in components/public/PublicEventInviteContent.tsx.
"use client";

import { useParams } from "next/navigation";
import PublicEventInviteContent from "@/components/public/PublicEventInviteContent";

export default function EventInvitePage() {
  const params = useParams();
  const slug = params.slug as string;
  return <PublicEventInviteContent slug={slug} />;
}
