// components/KioskAppShell.tsx
// The UX half of the kiosk lockdown (RLS, in
// supabase/migrations/20260808200100_kiosk_rls_lockdown.sql, is the real
// security boundary -- this is just what a kiosk session actually sees).
// A kiosk login gets no Sidebar and no access to any /dashboard/* route
// except /dashboard/calendar -- typing another URL directly redirects
// straight back. Every other role renders the normal Sidebar + content
// shell unchanged.
"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Tablet } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { supabase } from "@/lib/supabase";
import { clearAllClientCaches } from "@/lib/clearClientCaches";
import { markIntentionalSignOut } from "@/components/SessionHealthBanner";
import Sidebar from "@/components/Sidebar";
import TrialWorkspaceBanner from "@/components/TrialWorkspaceBanner";

const KIOSK_HOME = "/dashboard/calendar";

function signOut() {
  markIntentionalSignOut();
  clearAllClientCaches();
  supabase.auth.signOut().then(() => window.location.replace("/login"));
}

function KioskShell({ companyName, children }: { companyName: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== KIOSK_HOME) router.replace(KIOSK_HOME);
  }, [pathname, router]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5">
          <Tablet size={16} className="text-indigo-500" />
          <span className="text-[13px] font-bold text-slate-700">{companyName || "Kiosk"}</span>
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">
        {pathname === KIOSK_HOME ? children : null}
      </main>
    </div>
  );
}

export default function KioskAppShell({ children }: { children: React.ReactNode }) {
  const { role, companyName } = useCompany();

  // Defaults to the normal shell while role is still resolving (same as
  // every other CompanyContext-driven check in this app -- nothing here
  // blocks the fast cached-first-paint path companyBootstrap.ts is built
  // around). A kiosk login briefly sees the ordinary Sidebar for the one
  // render before its role resolves; that's a UX-only gap covered by RLS
  // (20260808200100_kiosk_rls_lockdown.sql), which denies the underlying
  // data regardless of what's rendered. Once role resolves to 'kiosk' this
  // swaps to the restricted shell and the effect below redirects away from
  // anything but the calendar.
  if (role === "kiosk") {
    return <KioskShell companyName={companyName}>{children}</KioskShell>;
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
      <aside className="flex-shrink-0">
        <Suspense fallback={<div className="w-72 p-10 animate-pulse bg-slate-50 h-full" />}>
          <Sidebar />
        </Suspense>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TrialWorkspaceBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
