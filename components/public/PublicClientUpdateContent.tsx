// components/public/PublicClientUpdateContent.tsx
// The actual client-update-page UI (MatterBoard + PIN gate) -- extracted
// from app/public/updates/[slug]/page.tsx so the exact same experience can
// render two ways: as the full standalone /public/updates/[slug] page
// (embedded=false, that route's own thin wrapper supplies slug from the
// URL), or inline inside a ClientUpdatePageWidget on a dashboard
// (embedded=true, see components/dashboard/ClientUpdatePageWidget.tsx)
// instead of just linking out to it.
//
// Dual-mode: a logged-in staff member of the page's own company gets the
// full editable board right here (no PIN, values/groups/matters/columns
// all editable, right on this page -- Settings only manages the page
// itself: create/revoke/PIN) via the authenticated by-slug route; anyone
// else -- no session, or a session that isn't a member of this company --
// falls back to the original genuinely-unauthenticated, PIN-gated, read +
// note-only flow. The one supabase.auth call this file makes is used only
// to *detect* a staff session -- every subsequent public-side read/write
// still goes through the zero-auth public API routes exactly as before, so
// an anonymous client's experience is unchanged. Embedding this in a
// dashboard widget doesn't need any special-casing: the viewer already has
// a staff session there, so it naturally resolves to the full editable
// board, same as opening the standalone link while signed in.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { perfLog, perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";
import { useDomSettled } from "@/lib/hooks/useDomSettled";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { readPinGatedCache, writePinGatedCache, clearPinGatedCache } from "@/lib/publicPageCache";
import { readCache, writeCache } from "@/lib/queryCache";
import MatterBoard, { type MatterBoardField, type MatterBoardGroup, type MatterBoardItem, type MatterBoardFormatRule } from "@/components/clientUpdatePages/MatterBoard";
import { auTodayStr } from "@/lib/companyLocalDate";

interface Board {
  groups: MatterBoardGroup[]; items: MatterBoardItem[]; fields: MatterBoardField[]; formatRules: MatterBoardFormatRule[];
  // Company-shared default sort/filter (see MatterBoard's own prop
  // comment) -- served by lib/clientUpdatePageDetail.ts to both the staff
  // and public routes, so an anonymous viewer inherits the admin's view.
  viewDefaults?: { groupId: string; filters: { fieldId: string; values: string[] }[]; sort: { fieldId: string; dir: "asc" | "desc" }[] }[];
  // Set by the server when it stripped currency values before sending.
  figuresRedacted?: boolean;
}
interface PageMeta { title: string; dateFormat: string; freezeFirstColumn: boolean; logCellChanges: boolean; baseTable?: "projects" | "entities" | "custom_table"; pageKind?: "user_dependent" | "auto_fed"; askEnabled: boolean; askScope: "emails" | "emails_notes" | "all" }

const boardCacheKey = (slug: string) => `client_update_board_${slug}`;
// Separate from boardCacheKey above, which is the PIN-gated CLIENT path's
// own cache (keyed by the remembered PIN -- not applicable here). Exported
// so lib/hooks/prefetchShells.ts's bootstrap warmer can pre-fetch this
// exact endpoint for every public_client_update_page widget across every
// dashboard during login (under the current viewer's own staff session)
// and seed this same slot -- this component's embedded/staff path otherwise
// has no caching of its own at all, unlike the rest of the app's
// dashboards/tables.
export const staffClientUpdateCacheKey = (slug: string) => `client_update_staff_${slug}`;
const codeCacheKey = (slug: string) => `client_update_code_${slug}`;
function getCachedCode(slug: string): string | null {
  try { return localStorage.getItem(codeCacheKey(slug)); } catch { return null; }
}
function setCachedCode(slug: string, code: string) {
  try { localStorage.setItem(codeCacheKey(slug), code); } catch { /* ignore */ }
}
function clearCachedCode(slug: string) {
  try { localStorage.removeItem(codeCacheKey(slug)); } catch { /* ignore */ }
}

interface Props {
  slug: string;
  // True when rendered inline inside a dashboard widget instead of the
  // standalone /public/updates/[slug] route -- drops the full-viewport
  // background/padding (the widget's own card chrome already supplies
  // that) and skips hijacking the browser tab title.
  embedded?: boolean;
  // Threaded straight through to MatterBoard's own prop of the same name --
  // see that file's comment. Read from the standalone route's own ?itemId=
  // query param (app/public/updates/[slug]/page.tsx), not here, since this
  // component is also used embedded in a dashboard widget where that query
  // param doesn't apply.
  initialFixItemId?: string;
  // Supplied by a caller that already holds this board's access code and
  // whose viewer has no way to type one -- specifically the public demo
  // hub (app/public/demo/[token]), where the hub link itself IS the
  // credential and a PIN prompt would be a dead end. Takes precedence
  // over the localStorage-remembered code; changes nothing about the
  // request path, so the viewer still gets the ordinary read-only
  // anonymous board.
  accessCode?: string;
  // See MatterBoard's prop of the same name.
  maskCurrency?: boolean;
}

export default function PublicClientUpdateContent({ slug, embedded = false, initialFixItemId, accessCode, maskCurrency }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"staff" | "client" | null>(null);
  const [staffPageId, setStaffPageId] = useState<string | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  // Embedded (inside a dashboard widget) has the app's shared top progress
  // bar available -- drive that instead of the full-panel spinner below,
  // which only makes sense for the standalone /public/updates/[slug] route
  // (no ProgressBarProvider out there, so this safely no-ops when !embedded).
  useProgressBarWhile(loading);

  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  // Signed-in, but not on any team this 'team'-visibility page is scoped to
  // (see lib/clientUpdatePageTeamAuth.ts) -- distinct from `error` (page
  // doesn't exist/expired/revoked) so the message is actionable rather than
  // just "not available".
  const [teamRestricted, setTeamRestricted] = useState(false);

  // ── Public (PIN-gated) fetch -- unchanged from the original flow ──────
  const fetchPublic = useCallback(async (code?: string) => {
    const url = code ? `/api/client-update-pages/public/${slug}?code=${encodeURIComponent(code)}` : `/api/client-update-pages/public/${slug}`;
    const res = await fetch(url);
    const json = await res.json();
    return { ok: res.ok, json };
  }, [slug]);

  const loadAsClient = useCallback(async () => {
    const cachedCode = accessCode || getCachedCode(slug);

    // Paint instantly from a previous visit's cache -- but only ever a
    // payload cached under the EXACT PIN currently remembered (see
    // lib/publicPageCache.ts's doc comment). The real validation below
    // still always runs regardless of whether this produced a paint; it's
    // purely a "show something now" optimization, not a substitute for it.
    const cached = cachedCode ? readPinGatedCache<{ meta: PageMeta; board: Board }>(boardCacheKey(slug), cachedCode) : null;
    if (cached) {
      setMode("client");
      setMeta(cached.meta);
      setBoard(cached.board);
      setLoading(false);
    }

    if (cachedCode) {
      const attempt = await fetchPublic(cachedCode);
      if (attempt.ok && !attempt.json.requiresCode) {
        // logCellChanges is a staff-only editing preference -- a client PIN
        // visitor never edits cells, so it's always true here (unused).
        const meta: PageMeta = { title: attempt.json.title, dateFormat: attempt.json.dateFormat, freezeFirstColumn: !!attempt.json.freezeFirstColumn, logCellChanges: true, baseTable: attempt.json.baseTable, pageKind: attempt.json.pageKind, askEnabled: !!attempt.json.askEnabled, askScope: "emails" };
        const board: Board = { groups: attempt.json.groups, items: attempt.json.items, fields: attempt.json.fields, formatRules: attempt.json.formatRules || [], viewDefaults: attempt.json.viewDefaults || [], figuresRedacted: !!attempt.json.figuresRedacted };
        setMode("client");
        // Bail out to the same object reference when this revalidate just
        // confirms the cached paint above was already correct -- otherwise
        // every visit forces a second full re-render of a potentially large
        // MatterBoard even when nothing changed, which (via useDomSettled's
        // whole-document MutationObserver) resets the "page is ready" timer
        // right back to the slow live fetch, silently undoing the cached
        // instant-paint's whole benefit.
        setMeta(prev => JSON.stringify(prev) === JSON.stringify(meta) ? prev : meta);
        setBoard(prev => JSON.stringify(prev) === JSON.stringify(board) ? prev : board);
        setLoading(false);
        writePinGatedCache(boardCacheKey(slug), cachedCode, { meta, board });
        return;
      }
      // The remembered PIN no longer works (revoked/rotated/page
      // deactivated) -- never leave whatever was optimistically painted
      // above on screen past this point, cached or not.
      clearCachedCode(slug);
      clearPinGatedCache(boardCacheKey(slug));
      if (cached) { setBoard(null); setLoading(true); }
    }
    const { ok, json } = await fetchPublic();
    if (!ok) { setError(json.error || "This page is not available"); setLoading(false); return; }
    setMode("client");
    setMeta({ title: json.title, dateFormat: json.dateFormat, freezeFirstColumn: !!json.freezeFirstColumn, logCellChanges: true, baseTable: json.baseTable, pageKind: json.pageKind, askEnabled: !!json.askEnabled, askScope: "emails" });
    if (json.requiresCode) { setNeedsCode(true); setLoading(false); return; }
    const board: Board = { groups: json.groups, items: json.items, fields: json.fields, formatRules: json.formatRules || [], viewDefaults: json.viewDefaults || [], figuresRedacted: !!json.figuresRedacted };
    setBoard(board);
    setLoading(false);
  }, [fetchPublic, slug]);

  // Shared by loadAsStaff's live-fetch success path and load()'s own
  // cache-paint below, so the by-slug JSON -> PageMeta/Board mapping only
  // lives in one place.
  const applyStaffJson = useCallback((json: any) => {
    setMode("staff");
    setStaffPageId(json.page.id);
    const nextMeta: PageMeta = { title: json.page.title, dateFormat: json.page.date_format, freezeFirstColumn: !!json.page.freeze_first_column, logCellChanges: json.page.log_cell_changes !== false, baseTable: json.page.base_table, pageKind: json.page.page_kind, askEnabled: !!json.page.ai_ask_enabled, askScope: (json.page.ai_ask_scope || "emails") };
    const nextBoard: Board = { groups: json.groups, items: json.items, fields: json.fields, formatRules: json.formatRules || [], viewDefaults: json.viewDefaults || [], figuresRedacted: !!json.figuresRedacted };
    // Bail out to the same object reference when this call (the cache-warm
    // paint, the live by-slug revalidate right after it, or a background
    // reload after a mutation) doesn't actually change anything -- the live
    // revalidate in load() below runs on EVERY visit regardless of the cache
    // hit just before it, so without this a warm cache's instant paint was
    // immediately followed by an identical-looking but still fully re-rendered
    // board, which (via useDomSettled's whole-document MutationObserver)
    // resets the "page is ready" timer back to whenever that live fetch
    // finished -- i.e. the cache never actually shortened anything the user
    // (or Admin > Performance) could see.
    setMeta(prev => JSON.stringify(prev) === JSON.stringify(nextMeta) ? prev : nextMeta);
    setBoard(prev => JSON.stringify(prev) === JSON.stringify(nextBoard) ? prev : nextBoard);
  }, []);

  // ── Try staff auth first; anything short of a clean 200 falls back ────
  // Exception: a 'team_restricted' 403 (signed in, but not on any team this
  // page is scoped to) is handled here directly rather than falling through
  // to the client/PIN flow -- that flow will just 404 anyway for a
  // 'team'-visibility page (see lib/clientUpdatePageGate.ts), which would
  // show a confusing generic error instead of an actionable one.
  const loadAsStaff = useCallback(async () => {
    const res = await fetch(`/api/client-update-pages/by-slug/${slug}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.reason === "team_restricted") { setTeamRestricted(true); return true; }
      return false;
    }
    const json = await res.json();
    applyStaffJson(json);
    writeCache(staffClientUpdateCacheKey(slug), json);
    return true;
  }, [slug, applyStaffJson]);

  const load = useCallback(async () => {
    setLoading(true);
    // "public" -- see lib/perfLog.ts's PerfPageKind doc comment. Fixed name
    // (not this specific slug) so every distinct client update board
    // aggregates into one "how's this feature performing" stat in
    // Admin > Performance, rather than fragmenting into one row per client.
    perfLogPageStart("public", "detailed table page");
    // getSession() reads the local session (no network round-trip) instead
    // of getUser() re-validating the JWT against the auth server on every
    // page load. Safe here because this only decides which fetch to try
    // first (staff vs client) -- loadAsStaff's by-slug route still
    // re-validates the real session server-side, so a stale/tampered local
    // session can't grant staff access, just cause one extra fallback
    // request to loadAsClient.
    const { data: { session } } = await supabase.auth.getSession();
    perfLog("public detailed table page: session resolved");
    if (session?.user) {
      // Paint instantly from whatever the login bootstrap (or a previous
      // visit this session) already cached for this exact board -- see
      // prefetchShells.ts's warmEmbeddedPublicPages. loadAsStaff() below
      // still always runs regardless of this hit, to revalidate.
      const cached = readCache<any>(staffClientUpdateCacheKey(slug));
      if (cached) { applyStaffJson(cached); setLoading(false); }
      if (await loadAsStaff()) {
        perfLog("public detailed table page: staff data resolved");
        setLoading(false);
        return;
      }
    }
    await loadAsClient();
    perfLog("public detailed table page: client data resolved");
  }, [loadAsStaff, loadAsClient, slug, applyStaffJson]);

  // "data resolved" (above) only marks when the fetch promise landed --
  // for a large matter board that's well before MatterBoard.tsx has
  // actually finished rendering/painting, which can itself take a real,
  // separate chunk of time. domSettled (same DOM-mutation-quiet technique
  // as components/PerfRouteTracker.tsx) fires once the page has actually
  // stopped changing, so THIS is the moment Admin > Performance's "ready"
  // marker should land on -- otherwise every recorded load time silently
  // excludes render time, which is exactly backwards when the render is
  // the suspect.
  const domSettled = useDomSettled(!loading);
  useEffect(() => {
    if (domSettled) perfLogPageReady("public", "detailed table page");
  }, [domSettled]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!embedded && meta?.title) document.title = meta.title; }, [meta?.title, embedded]);

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return;
    setCheckingCode(true);
    setCodeError(null);
    const code = codeInput.trim();
    const { ok, json } = await fetchPublic(code);
    setCheckingCode(false);
    if (!ok) { setCodeError(json.error || "Incorrect access code"); return; }
    setCachedCode(slug, code);
    setNeedsCode(false);
    const board: Board = { groups: json.groups, items: json.items, fields: json.fields, formatRules: json.formatRules || [], viewDefaults: json.viewDefaults || [], figuresRedacted: !!json.figuresRedacted };
    setBoard(board);
    // `meta` is already set (loadAsClient sets it before ever showing the
    // PIN gate) -- cache it alongside this newly-validated code so the next
    // visit can paint instantly instead of starting cold again.
    if (meta) writePinGatedCache(boardCacheKey(slug), code, { meta, board });
  };

  // ── Optimistic mutation handlers ───────────────────────────────────
  // In staff mode these hit the same authenticated admin routes the
  // Settings editor uses (cookie session carries auth); in client mode
  // only note-adding is wired up at all (MatterBoard gets canEdit=false).
  // A property-sourced field (Property Address, or any field_source:
  // 'property' column) isn't read from item.values on a matter's split
  // rows (2+ linked properties) -- MatterBoard's expandByProperty overrides
  // those per row from item.properties[].values instead (see its header
  // comment), so that also has to be patched here for the edit to actually
  // show up optimistically; item.values itself still gets it too, since a
  // single-property matter (no split) reads straight from there.
  const patchPropertyValue = (item: MatterBoardItem, fieldId: string, value: any, propertyId: string | undefined): MatterBoardItem["properties"] => {
    if (!item.properties?.length) return item.properties;
    const targetId = propertyId || item.properties[0].id;
    return item.properties.map(p => p.id === targetId ? { ...p, values: { ...p.values, [fieldId]: value } } : p);
  };

  const saveValue = (itemId: string, fieldId: string, value: any, propertyId: string | undefined, reason: string, capacity?: string | null) => {
    if (mode !== "staff" || !staffPageId) return;
    let prevValue: any;
    let prevProperties: Board["items"][number]["properties"];
    setBoard(prev => {
      if (!prev) return prev;
      const item = prev.items.find(i => i.id === itemId);
      prevValue = item?.values[fieldId];
      prevProperties = item?.properties;
      return {
        ...prev,
        items: prev.items.map(i => i.id === itemId
          ? { ...i, values: { ...i.values, [fieldId]: value }, properties: patchPropertyValue(i, fieldId, value, propertyId) }
          : i),
      };
    });
    fetch(`/api/client-update-pages/${staffPageId}/values`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, fieldId, value, propertyId, reason, capacity }),
    }).then(async res => {
      if (res.ok) return;
      // Revert just this one field (not the whole board) so it doesn't
      // clobber any other edit that landed optimistically in the meantime.
      const json = await res.json().catch(() => ({}));
      setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [fieldId]: prevValue }, properties: prevProperties } : i) });
      window.alert(json.error || "Couldn't save that value");
    });
  };

  // Cell history is readable in both modes -- staff via the same
  // authenticated route ActivityLogModal uses (filtered to one cell),
  // client via the PIN-gated public route (see
  // app/api/client-update-pages/public/[slug]/cell-logs/route.ts).
  const fetchCellHistory = useCallback(async (itemId: string, fieldId: string) => {
    const url = mode === "staff" && staffPageId
      ? `/api/client-update-pages/${staffPageId}/logs?itemId=${itemId}&fieldId=${fieldId}`
      : `/api/client-update-pages/public/${slug}/cell-logs?itemId=${itemId}&fieldId=${fieldId}&code=${encodeURIComponent(getCachedCode(slug) || "")}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Couldn't load history");
    return json.logs || [];
  }, [mode, staffPageId, slug]);

  // Persists the board's current sort/filter as the company-wide default
  // (see the view-defaults route). Updates local state too so the "saved"
  // value is what a re-render reads, without a full board reload.
  const saveViewDefault = async (
    groupId: string,
    filters: { fieldId: string; values: string[] }[],
    sort: { fieldId: string; dir: "asc" | "desc" }[]
  ) => {
    if (mode !== "staff" || !staffPageId) return;
    await fetch(`/api/client-update-pages/${staffPageId}/view-defaults`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, filters, sort }),
    });
    setBoard(prev => prev && {
      ...prev,
      viewDefaults: [...(prev.viewDefaults || []).filter(v => v.groupId !== groupId), { groupId, filters, sort }],
    });
  };

  const renameGroup = (groupId: string, name: string) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, name } : g) });
    fetch(`/api/client-update-pages/${staffPageId}/groups/${groupId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
  };

  const deleteGroup = (groupId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    if (!window.confirm("Delete this group? Its matters move to Ungrouped, nothing else changes.")) return;
    setBoard(prev => prev && {
      ...prev,
      groups: prev.groups.filter(g => g.id !== groupId && g.parent_group_id !== groupId),
      items: prev.items.map(i => i.group_id === groupId ? { ...i, group_id: null } : i),
    });
    fetch(`/api/client-update-pages/${staffPageId}/groups/${groupId}`, { method: "DELETE" });
  };

  const addGroup = (name: string, parentGroupId: string | null) => {
    if (mode !== "staff" || !staffPageId) return;
    const tempId = `temp-${Date.now()}`;
    setBoard(prev => prev && { ...prev, groups: [...prev.groups, { id: tempId, name, parent_group_id: parentGroupId }] });
    fetch(`/api/client-update-pages/${staffPageId}/groups`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentGroupId }),
    }).then(r => r.json()).then(json => {
      if (json.group) setBoard(prev => prev && { ...prev, groups: prev.groups.map(g => g.id === tempId ? json.group : g) });
    });
  };

  // Optimistic -- copies the shared fields into this group's own local
  // state (temp ids) immediately, so "Customize" -> "Revert to shared"
  // flips instantly instead of waiting on the round trip (the server does
  // real work here -- copying every shared field, adhoc values, and
  // re-pointing subgroup conditions -- see the route's header comment,
  // which is what made waiting on it feel slow). Swaps the temp copies for
  // the real fields once the request lands, or drops them back out if it
  // failed.
  const customizeColumns = (groupId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    let tempFields: MatterBoardField[] = [];
    setBoard(prev => {
      if (!prev) return prev;
      const sharedFields = prev.fields.filter(f => f.group_id === null);
      tempFields = sharedFields.map((f, i) => ({ ...f, id: `temp-customize-${Date.now()}-${i}`, group_id: groupId }));
      return { ...prev, fields: [...prev.fields, ...tempFields] };
    });

    fetch(`/api/client-update-pages/${staffPageId}/groups/${groupId}/customize-columns`, { method: "POST" }).then(async res => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBoard(prev => prev && { ...prev, fields: prev.fields.filter(f => !tempFields.some(t => t.id === f.id)) });
        window.alert(json.error || "Couldn't customize columns");
        return;
      }
      const realFields: MatterBoardField[] = json.fields || [];
      setBoard(prev => prev && { ...prev, fields: [...prev.fields.filter(f => !tempFields.some(t => t.id === f.id)), ...realFields] });
    });
  };

  const revertColumns = async (groupId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    const res = await fetch(`/api/client-update-pages/${staffPageId}/groups/${groupId}/customize-columns`, { method: "DELETE" });
    if (!res.ok) { const json = await res.json().catch(() => ({})); throw new Error(json.error || "Couldn't revert columns"); }
  };

  const renameMatter = (itemId: string, name: string) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, matterName: name } : i) });
    fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name }),
    });
  };

  const summarizeOpenMatters = async () => {
    if (mode !== "staff" || !staffPageId) return { generated: 0, skipped: 0, failed: [] as string[] };
    const res = await fetch(`/api/client-update-pages/${staffPageId}/summarize-open`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Couldn't generate summaries");
    await loadAsStaff();
    return json;
  };

  const clearSummaries = async () => {
    if (mode !== "staff" || !staffPageId) return 0;
    const res = await fetch(`/api/client-update-pages/${staffPageId}/summaries`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Couldn't clear summaries");
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => ({ ...i, ai_summary: null, ai_summary_generated_at: null })) });
    return json.cleared as number;
  };

  const moveItem = (itemId: string, groupId: string | null) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, group_id: groupId } : i) });
    fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId }),
    });
  };

  const removeItem = (itemId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, items: prev.items.filter(i => i.id !== itemId) });
    fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}`, { method: "DELETE" });
  };

  const generateSummary = async (itemId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    const res = await fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}/summarize`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { window.alert(json.error || "Failed to summarise emails"); return; }
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, ai_summary: json.summary, ai_summary_generated_at: json.generatedAt } : i) });
  };

  // Settlement-date AI review (projects pages only -- see
  // lib/clientUpdatePageSettlementReview.ts). Deliberately doesn't do the
  // usual optimistic setBoard update itself -- when it agrees, the caller
  // (MatterBoard's reviewSettlement/reviewSettlement in SpreadsheetView)
  // calls onDataChanged (reloadStaffBoard below) to pick up both the new
  // value AND the "AI set this" flag in one real refetch, rather than
  // hand-constructing that flag shape here.
  const reviewSettlement = async (itemId: string, fieldId: string, propertyId?: string) => {
    if (mode !== "staff" || !staffPageId) return { agreed: false, newDate: null, reasoning: "Not signed in as staff." };
    const res = await fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}/ai-review-settlement`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldId, propertyId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to review emails");
    return { agreed: !!json.agreed, newDate: json.newDate ?? null, reasoning: json.reasoning || "" };
  };

  const confirmAiFlag = async (itemId: string, fieldId: string, propertyId?: string) => {
    if (mode !== "staff" || !staffPageId) return;
    await fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}/ai-review-settlement/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldId, propertyId }),
    });
  };

  // Bulk sibling to reviewSettlement -- see
  // app/api/client-update-pages/[id]/settlement-status-all/route.ts's own
  // header for why this is the one path that logs a status entry for every
  // matter regardless of outcome, not just the ones where agreement is
  // reached. Reloads the board afterward the same way summarizeOpenMatters
  // does, since some matters may have had their date actually updated.
  const reviewAllSettlementStatus = async () => {
    if (mode !== "staff" || !staffPageId) return { reviewed: 0, agreed: 0, failed: [] as string[] };
    const res = await fetch(`/api/client-update-pages/${staffPageId}/settlement-status-all`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Couldn't check settlement status");
    await loadAsStaff();
    return json;
  };

  // "Ask anything about this matter" -- staff always get this (same as the
  // rest of the AI toolset); a client/public viewer only when meta.askEnabled
  // is on for the page (see the ternary that wires onAskQuestion into
  // <MatterBoard> below) -- this function itself doesn't need to re-check
  // that, since MatterBoard never renders the feature without the prop.
  const askQuestion = async (itemId: string, question: string, fields: { label: string; value: string }[]) => {
    const res = mode === "staff" && staffPageId
      ? await fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}/ask`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, fields }),
        })
      : await fetch(`/api/client-update-pages/public/${slug}/ask`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, question, fields, code: getCachedCode(slug) }),
        });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Couldn't get an answer");
    return json.answer as string;
  };

  const changeAskEnabled = (enabled: boolean) => {
    if (mode !== "staff" || !staffPageId) return;
    setMeta(prev => prev && { ...prev, askEnabled: enabled });
    fetch(`/api/client-update-pages/${staffPageId}/ask-settings`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
    });
  };

  const changeAskScope = (scope: "emails" | "emails_notes" | "all") => {
    if (mode !== "staff" || !staffPageId) return;
    setMeta(prev => prev && { ...prev, askScope: scope });
    fetch(`/api/client-update-pages/${staffPageId}/ask-settings`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }),
    });
  };

  const addNote = (itemId: string, note: string, propertyId?: string) => {
    if (!note.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const source: "staff" | "client" = mode === "staff" ? "staff" : "client";
    const optimisticNote = { id: tempId, note_date: auTodayStr(), body: note.trim(), author_name: mode === "staff" ? "You" : null, source, created_at: new Date().toISOString(), property_id: propertyId ?? null };
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notes: [optimisticNote, ...i.notes] } : i) });

    const request = mode === "staff" && staffPageId
      ? fetch(`/api/client-update-pages/${staffPageId}/notes`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, note, propertyId }),
        })
      : fetch(`/api/client-update-pages/public/${slug}/notes`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, note, code: getCachedCode(slug), propertyId }),
        });

    request.then(r => r.ok ? r.json() : null).then(json => {
      if (json?.note) setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notes: i.notes.map(n => n.id === tempId ? json.note : n) } : i) });
    });
  };

  const addFieldOption = async (fieldId: string, option: string) => {
    if (mode !== "staff" || !staffPageId) return;
    const res = await fetch(`/api/client-update-pages/${staffPageId}/fields/${fieldId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addOption: option }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { window.alert(json.error || "Couldn't add that option"); return; }
    setBoard(prev => prev && { ...prev, fields: prev.fields.map(f => f.id === fieldId ? { ...f, select_options: json.field.select_options } : f) });
  };

  const setGroupCondition = (groupId: string, fieldId: string | null, value: string | null) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, condition_field_id: fieldId, condition_value: value } : g) });
    fetch(`/api/client-update-pages/${staffPageId}/groups/${groupId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conditionFieldId: fieldId, conditionValue: value }),
    });
  };

  const setDefaultStatusFilter = (groupId: string, names: string[]) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, default_status_names: names } : g) });
    fetch(`/api/client-update-pages/${staffPageId}/groups/${groupId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultStatusNames: names }),
    });
  };

  const reorderFields = (fieldIds: string[]) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => {
      if (!prev) return prev;
      // fieldIds is just the active group's own visible fields, reordered
      // -- not the whole page (another group can have its own separately-
      // customized columns). Splice the reordered ones back in relative
      // order and leave every other field exactly where it was, rather
      // than replacing the whole array (which would silently drop every
      // other group's fields from local state until the next full reload).
      const reorderedSet = new Set(fieldIds);
      const byId = new Map(prev.fields.map(f => [f.id, f]));
      const reorderedFields = fieldIds.map(id => byId.get(id)!).filter(Boolean);
      const untouchedFields = prev.fields.filter(f => !reorderedSet.has(f.id));
      return { ...prev, fields: [...reorderedFields, ...untouchedFields] };
    });
    fetch(`/api/client-update-pages/${staffPageId}/fields/reorder`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldIds }),
    });
  };

  const changeDateFormat = (format: string) => {
    if (mode !== "staff" || !staffPageId) return;
    setMeta(prev => prev && { ...prev, dateFormat: format });
    fetch(`/api/client-update-pages/${staffPageId}/date-format`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFormat: format }),
    });
  };

  const addFormatRule = (fieldId: string, value: string, color: string) => {
    if (mode !== "staff" || !staffPageId) return;
    const tempId = `temp-${Date.now()}`;
    setBoard(prev => prev && { ...prev, formatRules: [...prev.formatRules, { id: tempId, field_id: fieldId, value, color }] });
    fetch(`/api/client-update-pages/${staffPageId}/format-rules`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldId, value, color }),
    }).then(r => r.json()).then(json => {
      if (json.rule) setBoard(prev => prev && { ...prev, formatRules: prev.formatRules.map(r => r.id === tempId ? json.rule : r) });
    });
  };

  const updateFormatRule = (ruleId: string, patch: { fieldId?: string; value?: string; color?: string }) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && {
      ...prev,
      formatRules: prev.formatRules.map(r => r.id === ruleId ? { ...r, ...(patch.fieldId ? { field_id: patch.fieldId } : {}), ...(patch.value ? { value: patch.value } : {}), ...(patch.color ? { color: patch.color } : {}) } : r),
    });
    fetch(`/api/client-update-pages/${staffPageId}/format-rules/${ruleId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
  };

  const removeFormatRule = (ruleId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, formatRules: prev.formatRules.filter(r => r.id !== ruleId) });
    fetch(`/api/client-update-pages/${staffPageId}/format-rules/${ruleId}`, { method: "DELETE" });
  };

  const changeFreezeColumn = (freeze: boolean) => {
    if (mode !== "staff" || !staffPageId) return;
    setMeta(prev => prev && { ...prev, freezeFirstColumn: freeze });
    fetch(`/api/client-update-pages/${staffPageId}/freeze-column`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ freeze }),
    });
  };

  const changeCellLogging = (logCellChanges: boolean) => {
    if (mode !== "staff" || !staffPageId) return;
    setMeta(prev => prev && { ...prev, logCellChanges });
    fetch(`/api/client-update-pages/${staffPageId}/cell-logging`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logCellChanges }),
    });
  };

  // Matters added or columns changed via their modals write straight to the
  // server (new rows need real ids) -- simplest to just reload the board
  // afterward rather than hand-reconcile every possible shape.
  const reloadStaffBoard = () => { if (mode === "staff") loadAsStaff(); };

  if (loading) {
    if (embedded) return null;
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  if (error) {
    return (
      <div className={embedded ? "flex items-center justify-center p-6" : "min-h-screen flex items-center justify-center bg-slate-50 p-6"}>
        <div className="max-w-sm w-full bg-white rounded-[32px] border border-slate-200 p-8 text-center space-y-2">
          <p className="text-[13px] font-bold text-slate-800">This page is not available</p>
          <p className="text-[12px] text-slate-500">The link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }

  if (teamRestricted) {
    return (
      <div className={embedded ? "flex items-center justify-center p-6" : "min-h-screen flex items-center justify-center bg-slate-50 p-6"}>
        <div className="max-w-sm w-full bg-white rounded-[32px] border border-slate-200 p-8 text-center space-y-2">
          <Lock size={28} className="text-slate-300 mx-auto" />
          <p className="text-[13px] font-bold text-slate-800">You don't have access to this page</p>
          <p className="text-[12px] text-slate-500">It's restricted to specific teams. Ask an admin if you think this is wrong.</p>
        </div>
      </div>
    );
  }

  if (!meta) return null;

  if (needsCode) {
    return (
      <div className={embedded ? "flex items-center justify-center p-6" : "min-h-screen flex items-center justify-center bg-slate-50 p-6"}>
        <div className="max-w-sm w-full bg-white rounded-[32px] border border-slate-200 p-8 text-center space-y-4">
          <Lock size={28} className="text-indigo-600 mx-auto" />
          <div>
            <p className="text-[15px] font-bold text-slate-800">{meta.title}</p>
            <p className="text-[12px] text-slate-500 mt-1">Enter the PIN you were given to continue.</p>
          </div>
          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value); setCodeError(null); }}
            onKeyDown={e => { if (e.key === "Enter") handleCodeSubmit(); }}
            placeholder="PIN"
            autoFocus
            className="w-full px-4 py-3 border border-slate-200 rounded-full text-[14px] font-bold tracking-wider text-center outline-none focus:border-indigo-400" />
          {codeError && <p className="text-[11px] text-red-500">{codeError}</p>}
          <button onClick={handleCodeSubmit} disabled={checkingCode || !codeInput.trim()}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {checkingCode ? <Loader2 size={14} className="animate-spin" /> : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  if (!board) return null;

  return (
    <div className={embedded ? "" : "min-h-screen bg-slate-50 p-4 sm:p-6"}>
      <div className={embedded ? "space-y-4" : "max-w-[1600px] mx-auto space-y-4"}>
        <h1 className="text-[16px] font-bold text-slate-800">{meta.title}</h1>

        {/* AI summaries (onGenerateSummary/onSummarizeOpenMatters/
            onClearSummaries below) are a projects/matters-only feature --
            their API routes assume item.project_id, not generalized for an
            entities-based page, so simply not offered there rather than
            exposing a button that would error. */}
        <MatterBoard
          pageId={mode === "staff" ? staffPageId! : undefined}
          baseTable={meta.baseTable}
          pageKind={meta.pageKind}
          initialFixItemId={initialFixItemId}
          groups={board.groups}
          items={board.items}
          fields={board.fields}
          formatRules={board.formatRules}
          viewDefaults={board.viewDefaults}
          maskCurrency={maskCurrency || !!board.figuresRedacted}
          onSaveViewDefault={mode === "staff" ? saveViewDefault : undefined}
          dateFormat={meta.dateFormat}
          freezeFirstColumn={meta.freezeFirstColumn}
          logCellChanges={meta.logCellChanges}
          canEdit={mode === "staff"}
          canComment
          onSaveValue={mode === "staff" ? saveValue : undefined}
          onFetchCellHistory={fetchCellHistory}
          onRenameGroup={mode === "staff" ? renameGroup : undefined}
          onDeleteGroup={mode === "staff" ? deleteGroup : undefined}
          onAddGroup={mode === "staff" ? addGroup : undefined}
          onSetGroupCondition={mode === "staff" ? setGroupCondition : undefined}
          onAddFieldOption={mode === "staff" ? addFieldOption : undefined}
          onSetDefaultStatusFilter={mode === "staff" ? setDefaultStatusFilter : undefined}
          onCustomizeColumns={mode === "staff" ? customizeColumns : undefined}
          onRevertColumns={mode === "staff" ? revertColumns : undefined}
          onMoveItem={mode === "staff" ? moveItem : undefined}
          // An auto_fed item (e.g. an Irregularities row) is a live mirror
          // of a rule-engine-managed record -- removing it from the page
          // wouldn't resolve anything underneath, it'd just desync until
          // the next recompute re-adds it. Fixing the flagged record's
          // actual field is the real "resolve" action.
          onRemoveItem={mode === "staff" && meta.pageKind !== "auto_fed" ? removeItem : undefined}
          onAddNote={addNote}
          onGenerateSummary={mode === "staff" && meta.baseTable !== "entities" ? generateSummary : undefined}
          onSummarizeOpenMatters={mode === "staff" && meta.baseTable !== "entities" ? summarizeOpenMatters : undefined}
          onClearSummaries={mode === "staff" && meta.baseTable !== "entities" ? clearSummaries : undefined}
          onRenameMatter={mode === "staff" ? renameMatter : undefined}
          onReorderFields={mode === "staff" ? reorderFields : undefined}
          onReviewSettlement={mode === "staff" && meta.baseTable === "projects" ? reviewSettlement : undefined}
          onConfirmAiFlag={mode === "staff" && meta.baseTable === "projects" ? confirmAiFlag : undefined}
          onReviewAllSettlementStatus={mode === "staff" && meta.baseTable === "projects" ? reviewAllSettlementStatus : undefined}
          onAskQuestion={meta.baseTable === "projects" && (mode === "staff" || meta.askEnabled) ? askQuestion : undefined}
          askEnabled={meta.askEnabled}
          askScope={meta.askScope}
          onAskEnabledChanged={mode === "staff" && meta.baseTable === "projects" ? changeAskEnabled : undefined}
          onAskScopeChanged={mode === "staff" && meta.baseTable === "projects" ? changeAskScope : undefined}
          onDataChanged={reloadStaffBoard}
          onDateFormatChanged={changeDateFormat}
          onFreezeFirstColumnChanged={mode === "staff" ? changeFreezeColumn : undefined}
          onLogCellChangesChanged={mode === "staff" ? changeCellLogging : undefined}
          onAddFormatRule={mode === "staff" ? addFormatRule : undefined}
          onUpdateFormatRule={mode === "staff" ? updateFormatRule : undefined}
          onRemoveFormatRule={mode === "staff" ? removeFormatRule : undefined}
        />
      </div>
    </div>
  );
}
