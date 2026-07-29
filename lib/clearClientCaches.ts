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
// components/CompanyContext.tsx's own company-identity shell) each cache
// to localStorage under their own key scheme, and it's easy for any ONE of
// them to be missed by a hand-maintained "here's what to clear on switch"
// list -- which is exactly what happened: the sign-out handler and the
// switch-company handler each grew their own different, both incomplete,
// list of what to clear. A single authoritative "clear literally
// everything" function, called from both places, means a future new cache
// module doesn't need its own entry added to two separate lists to stay
// leak-free -- as long as it's written under one of the prefixes below (or
// through components/QueryProvider.tsx's persisted React Query client),
// switching identity always starts fully cold rather than relying on every
// individual cache being correctly company/user-scoped. Company/user
// scoping the individual keys (already done for several of the above) is
// still worth doing where it lets a REPEAT visit to the same company stay
// warm across a switch-and-switch-back -- this function is the backstop
// for when that scoping is wrong, missing, or simply hasn't been added yet
// for some future cache.
import { clearAllShellCache, clearShellCache } from "@/lib/shellCache";
import { clearCache as clearQueryCache } from "@/lib/queryCache";
import { clearPersistedQueryCache } from "@/components/QueryProvider";
import { COMPANY_CACHE_KEY } from "@/components/CompanyContext";

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

// Lighter-weight sibling of clearAllClientCaches(), for switching active
// company specifically (NOT sign-out, which still needs the full wipe --
// see that call site's own comment on why a shared-machine "next signed-in
// user" scenario can't lean on any of this file's scoping assumptions).
//
// Every cache module this file's own doc comment lists (table/dashboard
// shells, custom fields, related fields, row data, Sidebar's tree/saved-
// views/profile) is now genuinely scoped by companyId (or, for
// user-level preferences like tree config, by userId -- scoping that
// doesn't need to change on a company switch at all). That means clearing
// them on switch was never buying additional safety once that scoping
// landed -- a switch to a company whose shells were never warmed simply
// misses on the new companyId-keyed lookup regardless, same as any other
// cold cache -- it was ONLY throwing away legitimately reusable data for
// a company already visited this session, forcing a full cold bootstrap
// on EVERY switch even switching back to one you were just in a moment
// ago. Confirmed live: switching companies repeatedly never got any
// faster with the full wipe, exactly matching that.
//
// COMPANY_CACHE_KEY is the one exception -- it's not (can't be) scoped by
// companyId, since its whole purpose is answering "what company is
// active" before that's known, so it's still cleared here: without this,
// AppLoader.tsx's "warm return visit" fast path would trust the PREVIOUS
// company's cached identity and skip awaiting the real bootstrap after a
// switch. The persisted React Query cache is also still cleared -- it
// backs a handful of settings/admin/marketplace pages outside this
// session's scoping audit, cheap to drop compared to the expensive shells/
// rows this function is specifically trying to preserve.
export function clearActiveIdentityCache(): void {
  clearShellCache(COMPANY_CACHE_KEY);
  clearPersistedQueryCache();
}
