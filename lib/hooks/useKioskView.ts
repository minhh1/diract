// lib/hooks/useKioskView.ts
// True for a real kiosk login, OR an admin previewing the kiosk check-in
// screen from their own session (Sidebar's account menu -> "Enter kiosk
// mode", which links to ?view=kiosk -- see components/KioskAppShell.tsx).
// The preview never touches the real company_memberships.role, so nothing
// else that checks role directly (RLS, lib/companyBootstrap.ts) is
// affected, and there's nothing to undo server-side when the admin exits --
// it's purely a client-side rendering choice shared by KioskAppShell (shell
// chrome) and the calendar page (the restricted check-in/roster view).
"use client";

import { useSearchParams } from "next/navigation";
import { useCompany } from "@/components/CompanyContext";

export function useKioskView(): boolean {
  const { role, isAdmin } = useCompany();
  const searchParams = useSearchParams();
  return role === "kiosk" || (isAdmin && searchParams.get("view") === "kiosk");
}

// Which of the company's kiosk_accounts an admin's preview session should
// act as (see Sidebar.tsx's "Enter kiosk mode", which resolves/creates one
// per physical device via localStorage before navigating here) -- null for
// a real kiosk login, which always acts as itself.
export function useKioskAccountId(): string | null {
  const searchParams = useSearchParams();
  return searchParams.get("kioskAccountId");
}
