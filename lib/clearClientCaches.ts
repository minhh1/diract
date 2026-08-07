"use client";

// lib/clearClientCaches.ts
// Wipes every client-side cache that could otherwise paint stale data for
// the WRONG identity on the next render -- switching active company, or
// signing out.
//
// This exists because that exact bug (stale cross-company data flashing
// for a moment after switching) kept recurring: several independent cache
// modules (lib/hooks/prefetchShells.ts's table/dashboard shells,
// lib/hooks/useCompanyCustomFields.ts, lib/hooks/useRelatedFields.ts,
// lib/hooks/useCustomTables.ts/useCustomDashboards.ts's sidebar lists,
// components/CompanyContext.tsx's own company-identity shell) each cache
// to localStorage or module-level state under their own key scheme, and
// it's easy for any ONE of them to be missed by a hand-maintained "here's
// what to clear on switch" list -- which is exactly what happened twice:
// the sign-out handler and the switch-company handler each grew their own
// different, both incomplete, list of what to clear; and later, a
// deliberately narrowed switch-company clear (this file used to also
// export a lighter clearActiveIdentityCache(), on the theory that every
// OTHER cache was by then genuinely companyId-scoped) turned out to still
// miss useCustomTables/useCustomDashboards' userId-only-keyed module
// caches, reported live as stale other-company data after a switch. A
// single authoritative "clear literally everything" function, called from
// every place identity can change, means a future new cache module
// doesn't need its own entry added to several separate lists to stay
// leak-free -- as long as it's written under one of the prefixes below (or
// through components/QueryProvider.tsx's persisted React Query client),
// switching identity always starts fully cold rather than relying on every
// individual cache being correctly company/user-scoped.
import { clearAllShellCache } from "@/lib/shellCache";
import { clearCache as clearQueryCache } from "@/lib/queryCache";
import { clearPersistedQueryCache } from "@/components/QueryProvider";

export function clearAllClientCaches(): void {
  clearAllShellCache();
  clearQueryCache();
  clearPersistedQueryCache();
  if (typeof window === "undefined") return;
  try {
    // Legacy prefixes some older caching code wrote under directly (not
    // through lib/queryCache.ts's nk_cache_ helper) -- see
    // components/AppLoader.tsx's matching version-bump sweep, which this
    // mirrors so "clear everything" means the same thing in both places.
    Object.keys(window.localStorage)
      .filter(k => k.startsWith("nk_pref_") || k.startsWith("nk_rows_") || k.startsWith("rows_"))
      .forEach(k => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
