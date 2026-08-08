// app/public/pages/[slug]/page.tsx
// GENUINELY UNAUTHENTICATED view for a company_pages row (see
// app/api/pages/public/[slug]/route.ts). Renders through the exact same
// <PageBlocks> component the Settings builder's live preview uses
// (components/pages/PageBlockRenderer.tsx) -- there is no other rendering
// path for this content anywhere in the app.
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { PageBlocks } from "@/components/pages/PageBlockRenderer";
import type { PageBlock } from "@/lib/pages/blockTypes";

interface PublicPageResult {
  title: string;
  requiresCode: boolean;
  blocks: PageBlock[];
}

export default function PublicPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [result, setResult] = useState<PublicPageResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const load = useCallback((withCode?: string) => {
    const url = withCode ? `/api/pages/public/${slug}?code=${encodeURIComponent(withCode)}` : `/api/pages/public/${slug}`;
    return fetch(url).then(async r => {
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (withCode) setCodeError(json.error || "Incorrect code");
        else setNotFound(true);
        return;
      }
      setResult(json);
    });
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckingCode(true);
    setCodeError(null);
    await load(code.trim());
    setCheckingCode(false);
  };

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">This page doesn&apos;t exist, or is no longer available.</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-300" size={24} />
      </div>
    );
  }

  if (result.requiresCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <form onSubmit={submitCode} className="bg-white border border-slate-200 rounded-[32px] p-8 w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Lock size={16} />
            <p className="font-medium">{result.title}</p>
          </div>
          <p className="text-[12px] text-slate-400">Enter the access code you were given to view this page.</p>
          <input type="text" value={code} onChange={e => setCode(e.target.value)} autoFocus
            className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-400" placeholder="Access code" />
          {codeError && <p className="text-[11px] text-red-500">{codeError}</p>}
          <button type="submit" disabled={checkingCode || !code.trim()}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-slate-700 disabled:opacity-40 transition-colors">
            {checkingCode ? "Checking..." : "View page"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-[40px] p-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">{result.title}</h1>
        <PageBlocks blocks={result.blocks} />
      </div>
    </div>
  );
}
