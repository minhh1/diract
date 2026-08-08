// components/MessagingBell.tsx
// Rail icon for the messaging feature -- a plain Link + unread badge
// (Marketplace's shape, components/Sidebar.tsx:1296-1305), not a dropdown
// like NotificationBell -- messaging already has its own full page to
// browse, so clicking straight through there is the right interaction,
// unlike the bell's "peek without leaving the page" purpose.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useMessagingChannels } from "@/lib/hooks/useMessagingChannels";
import { useProgressBar } from "@/components/TopProgressBar";

export default function MessagingBell() {
  const { companyId, userId } = useCompany();
  const { unreadChannelCount } = useMessagingChannels(companyId, userId);
  const pathname = usePathname();
  const { startNavigation } = useProgressBar();

  if (!userId) return null;

  return (
    <Link
      href="/dashboard/messaging"
      onClick={() => { if (!pathname.startsWith("/dashboard/messaging")) startNavigation(); }}
      title="Messages"
      aria-label="Messages"
      className={`relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
        pathname.startsWith("/dashboard/messaging") ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
      }`}
    >
      <MessageCircle size={17} />
      {unreadChannelCount > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
          {unreadChannelCount > 99 ? "99+" : unreadChannelCount}
        </span>
      )}
    </Link>
  );
}
