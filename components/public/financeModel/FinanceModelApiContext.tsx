"use client";

// Lets the Finance Model subtabs run unchanged in two very different
// places: the authenticated record tab (where they hit
// /api/finance-model/* with a session) and a public share page (no
// session, one read-only route -- see
// app/api/finance-model-pages/public/[pageId]/fm/route.ts).
//
// Rather than branching inside every subtab, the subtabs call `apiFetch`
// and this context decides where that lands. Internally it's a pass-through
// to plain fetch. Publicly it rewrites
//   /api/finance-model/<resource>?projectId=X&loanId=Y
// to
//   /api/finance-model-pages/public/<pageId>/fm?resource=<resource>&loanId=Y&code=Z
// preserving every other query param. projectId is dropped on purpose: the
// public route resolves the project from the page itself and ignores any
// caller-supplied value, so passing it along would only imply it mattered.
//
// `readOnly` is the second half: it tells subtabs to hide their write
// affordances. That is a UI courtesy, NOT the security boundary -- the
// public route exposes no write methods at all, so a hidden button and a
// crafted request fail the same way.
import { createContext, useContext, useMemo } from "react";

export interface FinanceModelApi {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  readOnly: boolean;
}

const defaultApi: FinanceModelApi = {
  apiFetch: (input, init) => fetch(input, init),
  readOnly: false,
};

const FinanceModelApiContext = createContext<FinanceModelApi>(defaultApi);

export function useFinanceModelApi(): FinanceModelApi {
  return useContext(FinanceModelApiContext);
}

export function FinanceModelApiProvider({
  pageId, accessCode, children,
}: { pageId?: string; accessCode?: string; children: React.ReactNode }) {
  const value = useMemo<FinanceModelApi>(() => {
    if (!pageId) return defaultApi;
    return {
      readOnly: true,
      apiFetch: (input, init) => {
        // Only GETs can be served publicly; anything else is a subtab
        // trying to write on a read-only page. Fail it here with a clear
        // message rather than firing an authenticated URL that would 401.
        const method = (init?.method || "GET").toUpperCase();
        if (method !== "GET") {
          return Promise.resolve(new Response(
            JSON.stringify({ error: "This is a read-only preview" }),
            { status: 405, headers: { "Content-Type": "application/json" } }
          ));
        }
        const url = new URL(input, window.location.origin);
        const match = url.pathname.match(/^\/api\/finance-model\/(.+)$/);
        if (!match) return fetch(input, init);

        const target = new URL(`/api/finance-model-pages/public/${pageId}/fm`, window.location.origin);
        target.searchParams.set("resource", match[1]);
        url.searchParams.forEach((v, k) => { if (k !== "projectId") target.searchParams.set(k, v); });
        if (accessCode) target.searchParams.set("code", accessCode);
        return fetch(target.toString(), init);
      },
    };
  }, [pageId, accessCode]);

  return <FinanceModelApiContext.Provider value={value}>{children}</FinanceModelApiContext.Provider>;
}
