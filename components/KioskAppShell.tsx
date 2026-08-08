// components/KioskAppShell.tsx
// The UX half of the kiosk lockdown (RLS, in
// supabase/migrations/20260808200100_kiosk_rls_lockdown.sql, is the real
// security boundary -- this is just what a kiosk session actually sees).
// A kiosk login gets no Sidebar and no access to any /dashboard/* route
// except /dashboard/calendar -- typing another URL directly redirects
// straight back. Every other role renders the normal Sidebar + content
// shell unchanged.
//
// An admin can also PREVIEW this screen from their own session (Sidebar's
// account menu -> "Enter kiosk mode", ?view=kiosk -- see useKioskView())
// so an iPad already signed in as an admin can be turned into a check-in
// kiosk without a separate kiosk login. This never touches the real
// company_memberships.role -- it's a client-only rendering choice, so
// there's nothing to undo server-side on exit, just drop the query param.
"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Tablet, X } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useKioskView } from "@/lib/hooks/useKioskView";
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

function KioskShell({ companyName, isPreview, children }: {
  companyName: string | null;
  isPreview: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== KIOSK_HOME) router.replace(isPreview ? `${KIOSK_HOME}?view=kiosk` : KIOSK_HOME);
  }, [pathname, router, isPreview]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5">
          <Tablet size={16} className="text-indigo-500" />
          <span className="text-[13px] font-bold text-slate-700">{companyName || "Kiosk"}</span>
          {isPreview && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold uppercase tracking-wide">
              Preview
            </span>
          )}
        </div>
        {isPreview ? (
          // Just drops ?view=kiosk -- the admin's real session/role never
          // changed, so there's nothing to sign out of.
          <button
            onClick={() => router.replace(KIOSK_HOME)}
            title="Exit kiosk mode"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={13} /> Exit kiosk mode
          </button>
        ) : (
          <button
            onClick={signOut}
            title="Sign out"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={13} /> Sign out
          </button>
        )}
      </header>
      <main className="flex-1 overflow-y-auto">
        {pathname === KIOSK_HOME ? children : null}
      </main>
    </div>
  );
}

function NormalShell({ children }: { children: React.ReactNode }) {
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

// Isolated in its own component, wrapped in Suspense by the default export
// below, so useKioskView()'s useSearchParams() doesn't force the rest of
// this already-client-heavy shell to de-opt from prerendering.
function KioskModeGate({ children }: { children: React.ReactNode }) {
  const { role, companyName } = useCompany();
  const kioskView = useKioskView();

  if (kioskView) {
    return <KioskShell companyName={companyName} isPreview={role !== "kiosk"}>{children}</KioskShell>;
  }
  return <NormalShell>{children}</NormalShell>;
}

export default function KioskAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-slate-50" />}>
      <KioskModeGate>{children}</KioskModeGate>
    </Suspense>
  );
}
