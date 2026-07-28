// components/QueryProvider.tsx
"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { APP_CACHE_VERSION } from "@/lib/appCacheVersion";

const PERSIST_KEY = "nk_rq_cache";
// How long a persisted snapshot is still trusted to restore from on mount --
// deliberately longer than any individual query's own staleTime/gcTime
// (which govern in-memory freshness once restored): this only bounds "is
// this localStorage blob itself too old to bother restoring at all" (e.g.
// a laptop that's been closed for a week), not how fresh the data looks
// once it's back.
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

let persisterSingleton: ReturnType<typeof createSyncStoragePersister> | null = null;
function getPersister() {
  if (typeof window === "undefined") return null;
  if (!persisterSingleton) {
    persisterSingleton = createSyncStoragePersister({ storage: window.localStorage, key: PERSIST_KEY });
  }
  return persisterSingleton;
}

// Set once QueryProvider mounts -- clearPersistedQueryCache needs the live
// instance, not just the localStorage key, because PersistQueryClientProvider
// re-persists the in-memory cache on its own throttle. Clearing only the
// localStorage key left a race: sign-out removed the key, but the still-
// populated in-memory client got re-persisted moments later (before the
// redirect actually unloaded the page), writing the previous user's data
// right back -- confirmed live with two throwaway accounts on a shared
// browser. Clearing the client itself removes what there'd be to re-persist.
let activeQueryClient: QueryClient | null = null;

// Called from the sign-out handler (components/Sidebar.tsx). Without this, a
// persisted cache from the signed-out user survives the redirect to /login
// and could rehydrate under the NEXT signed-in user on a shared machine for
// a moment before fresh RLS-scoped fetches overwrite it -- harmless before
// this file added real persistence (the in-memory cache died on reload
// regardless), a real leak risk now that it's written to localStorage.
export function clearPersistedQueryCache(): void {
  activeQueryClient?.clear();
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(PERSIST_KEY); } catch {
    // ignore -- quota/private-browsing, nothing to clean up either way
  }
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  }));
  activeQueryClient = queryClient;

  const persister = getPersister();
  // SSR has no window/localStorage -- render the plain provider (no
  // persistence) rather than crash; the client-side render picks up the
  // persister normally once hydrated.
  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: APP_CACHE_VERSION }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
