// app/public/demo/[token]/page.tsx
// A single GENUINELY UNAUTHENTICATED link that puts a company's boards,
// Finance Model pages and Residual Land Solver pages behind one tab strip,
// for demoing the product to a prospect who shouldn't have to make an
// account. Backed by app/api/public-demo/[token]/route.ts; see
// supabase/migrations/20260802100000_public_demo_hubs.sql for the security
// posture (bearer-token-in-URL, mandatory expiry, instant revocation).
//
// Deliberately assembly, not new UI: every tab renders the SAME public
// component the standalone link already uses, so the demo can't drift from
// the real thing, and read-only comes for free -- each of those components'
// anonymous paths is already view-only. The hub introduces no write path.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, LayoutDashboard, TrendingUp, Landmark, ChevronLeft, ChevronRight } from "lucide-react";
import PublicClientUpdateContent from "@/components/public/PublicClientUpdateContent";
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";
import ResidualLandSolverContent from "@/components/public/ResidualLandSolverContent";

interface Section {
  kind: "board" | "finance_model" | "solver";
  key: string;
  title: string;
  accessCode: string | null;
}

const ICON = { board: LayoutDashboard, finance_model: TrendingUp, solver: Landmark };

export default function PublicDemoHubPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [maskFigures, setMaskFigures] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public-demo/${token}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(json.error || "This link is not available"); return; }
        setTitle(json.title ?? null);
        setExpiresAt(json.expiresAt ?? null);
        setSections(json.sections || []);
        setMaskFigures(json.maskFigures !== false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center max-w-sm">
          <p className="text-[13px] font-medium text-rose-600 mb-1">Not available</p>
          <p className="text-[12px] text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  const active = sections[activeIdx];

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h1 className="text-[15px] font-bold text-slate-800">{title || "Demo"}</h1>
          {expiresAt && (
            <p className="text-[10px] text-slate-400">
              Read-only preview · figures hidden · access expires {new Date(expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {sections.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
            <p className="text-[12px] text-slate-400">Nothing has been shared on this link yet.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto tab-strip-scroll">
              {sections.map((s, i) => {
                const Icon = ICON[s.kind];
                const isActive = i === activeIdx;
                return (
                  <button
                    key={`${s.kind}:${s.key}`}
                    onClick={() => setActiveIdx(i)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap ${
                      isActive ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <Icon size={13} /> {s.title}
                  </button>
                );
              })}
            </div>

            {/* Keyed so switching tabs remounts cleanly rather than
                leaking the previous section's loaded state into the next. */}
            {active && (
              <div key={`${active.kind}:${active.key}`}>
                {active.kind === "board" && (
                  <PublicClientUpdateContent slug={active.key} accessCode={active.accessCode ?? undefined} embedded maskCurrency={maskFigures} />
                )}
                {active.kind === "finance_model" && (
                  <PublicFinanceModelContent pageId={active.key} mode="public" accessCode={active.accessCode ?? undefined} embedded maskCurrency={maskFigures} />
                )}
                {active.kind === "solver" && (
                  <ResidualLandSolverContent pageId={active.key} />
                )}
              </div>
            )}

            {sections.length > 1 && (
              <div className="flex items-center justify-between px-1 pt-2">
                <button
                  onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                >
                  <ChevronLeft size={12} /> Previous
                </button>
                <button
                  onClick={() => setActiveIdx(i => Math.min(sections.length - 1, i + 1))}
                  disabled={activeIdx === sections.length - 1}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                >
                  Next <ChevronRight size={12} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
