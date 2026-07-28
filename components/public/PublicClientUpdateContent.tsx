// components/public/PublicClientUpdateContent.tsx
// The actual client-update-page UI (MatterBoard + PIN gate) — extracted
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
import MatterBoard, { type MatterBoardField, type MatterBoardGroup, type MatterBoardItem, type MatterBoardFormatRule } from "@/components/clientUpdatePages/MatterBoard";

interface Board { groups: MatterBoardGroup[]; items: MatterBoardItem[]; fields: MatterBoardField[]; formatRules: MatterBoardFormatRule[]; }
interface PageMeta { title: string; dateFormat: string; freezeFirstColumn: boolean }

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
}

export default function PublicClientUpdateContent({ slug, embedded = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"staff" | "client" | null>(null);
  const [staffPageId, setStaffPageId] = useState<string | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [board, setBoard] = useState<Board | null>(null);

  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  // ── Public (PIN-gated) fetch -- unchanged from the original flow ──────
  const fetchPublic = useCallback(async (code?: string) => {
    const url = code ? `/api/client-update-pages/public/${slug}?code=${encodeURIComponent(code)}` : `/api/client-update-pages/public/${slug}`;
    const res = await fetch(url);
    const json = await res.json();
    return { ok: res.ok, json };
  }, [slug]);

  const loadAsClient = useCallback(async () => {
    const cachedCode = getCachedCode(slug);
    if (cachedCode) {
      const attempt = await fetchPublic(cachedCode);
      if (attempt.ok && !attempt.json.requiresCode) {
        setMode("client");
        setMeta({ title: attempt.json.title, dateFormat: attempt.json.dateFormat, freezeFirstColumn: !!attempt.json.freezeFirstColumn });
        setBoard({ groups: attempt.json.groups, items: attempt.json.items, fields: attempt.json.fields, formatRules: attempt.json.formatRules || [] });
        setLoading(false);
        return;
      }
      clearCachedCode(slug);
    }
    const { ok, json } = await fetchPublic();
    if (!ok) { setError(json.error || "This page is not available"); setLoading(false); return; }
    setMode("client");
    setMeta({ title: json.title, dateFormat: json.dateFormat, freezeFirstColumn: !!json.freezeFirstColumn });
    if (json.requiresCode) { setNeedsCode(true); setLoading(false); return; }
    setBoard({ groups: json.groups, items: json.items, fields: json.fields, formatRules: json.formatRules || [] });
    setLoading(false);
  }, [fetchPublic, slug]);

  // ── Try staff auth first; anything short of a clean 200 falls back ────
  const loadAsStaff = useCallback(async () => {
    const res = await fetch(`/api/client-update-pages/by-slug/${slug}`);
    if (!res.ok) return false;
    const json = await res.json();
    setMode("staff");
    setStaffPageId(json.page.id);
    setMeta({ title: json.page.title, dateFormat: json.page.date_format, freezeFirstColumn: !!json.page.freeze_first_column });
    setBoard({ groups: json.groups, items: json.items, fields: json.fields, formatRules: json.formatRules || [] });
    return true;
  }, [slug]);

  const load = useCallback(async () => {
    setLoading(true);
    // "public" -- see lib/perfLog.ts's PerfPageKind doc comment. Fixed name
    // (not this specific slug) so every distinct client update board
    // aggregates into one "how's this feature performing" stat in
    // Admin > Performance, rather than fragmenting into one row per client.
    perfLogPageStart("public", "client update page");
    // getSession() reads the local session (no network round-trip) instead
    // of getUser() re-validating the JWT against the auth server on every
    // page load. Safe here because this only decides which fetch to try
    // first (staff vs client) -- loadAsStaff's by-slug route still
    // re-validates the real session server-side, so a stale/tampered local
    // session can't grant staff access, just cause one extra fallback
    // request to loadAsClient.
    const { data: { session } } = await supabase.auth.getSession();
    perfLog("public client update page: session resolved");
    if (session?.user && await loadAsStaff()) {
      perfLog("public client update page: staff data resolved");
      setLoading(false);
      perfLogPageReady("public", "client update page");
      return;
    }
    await loadAsClient();
    perfLog("public client update page: client data resolved");
    perfLogPageReady("public", "client update page");
  }, [loadAsStaff, loadAsClient]);

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
    setBoard({ groups: json.groups, items: json.items, fields: json.fields, formatRules: json.formatRules || [] });
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

  const saveValue = (itemId: string, fieldId: string, value: any, propertyId?: string) => {
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
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, fieldId, value, propertyId }),
    }).then(async res => {
      if (res.ok) return;
      // Revert just this one field (not the whole board) so it doesn't
      // clobber any other edit that landed optimistically in the meantime.
      const json = await res.json().catch(() => ({}));
      setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [fieldId]: prevValue }, properties: prevProperties } : i) });
      window.alert(json.error || "Couldn't save that value");
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

  const addNote = (itemId: string, note: string, propertyId?: string) => {
    if (!note.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const source: "staff" | "client" = mode === "staff" ? "staff" : "client";
    const optimisticNote = { id: tempId, note_date: new Date().toISOString().slice(0, 10), body: note.trim(), author_name: mode === "staff" ? "You" : null, source, created_at: new Date().toISOString(), property_id: propertyId ?? null };
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

  const appendEmail = (itemId: string, email: { subject: string; fromName: string; snippet: string; emailDate: string }) => {
    if (mode !== "staff" || !staffPageId) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticEmail = {
      id: tempId, subject: email.subject || null, from_name: email.fromName || null, from_address: null,
      snippet: email.snippet || null, email_date: email.emailDate, added_by_name: "You", created_at: new Date().toISOString(),
    };
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, emails: [optimisticEmail, ...i.emails] } : i) });

    fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}/emails`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: email.subject, fromName: email.fromName, snippet: email.snippet, emailDate: email.emailDate }),
    }).then(async res => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, emails: i.emails.filter(e => e.id !== tempId) } : i) });
        window.alert(json.error || "Couldn't log that email");
        return;
      }
      if (json.email) setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, emails: i.emails.map(e => e.id === tempId ? json.email : e) } : i) });
    });
  };

  const removeEmail = (itemId: string, emailId: string) => {
    if (mode !== "staff" || !staffPageId) return;
    let prevEmails: any[] = [];
    setBoard(prev => {
      if (!prev) return prev;
      prevEmails = prev.items.find(i => i.id === itemId)?.emails || [];
      return { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, emails: i.emails.filter(e => e.id !== emailId) } : i) };
    });
    fetch(`/api/client-update-pages/${staffPageId}/items/${itemId}/emails/${emailId}`, { method: "DELETE" }).then(res => {
      if (res.ok) return;
      setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, emails: prevEmails } : i) });
      window.alert("Couldn't remove that email");
    });
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

  // Matters added or columns changed via their modals write straight to the
  // server (new rows need real ids) -- simplest to just reload the board
  // afterward rather than hand-reconcile every possible shape.
  const reloadStaffBoard = () => { if (mode === "staff") loadAsStaff(); };

  if (loading) {
    return <div className={embedded ? "flex items-center justify-center py-12" : "min-h-screen flex items-center justify-center bg-slate-50"}><Loader2 className="animate-spin text-slate-400" /></div>;
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

        <MatterBoard
          pageId={mode === "staff" ? staffPageId! : undefined}
          groups={board.groups}
          items={board.items}
          fields={board.fields}
          formatRules={board.formatRules}
          dateFormat={meta.dateFormat}
          freezeFirstColumn={meta.freezeFirstColumn}
          canEdit={mode === "staff"}
          canComment
          onSaveValue={mode === "staff" ? saveValue : undefined}
          onRenameGroup={mode === "staff" ? renameGroup : undefined}
          onDeleteGroup={mode === "staff" ? deleteGroup : undefined}
          onAddGroup={mode === "staff" ? addGroup : undefined}
          onSetGroupCondition={mode === "staff" ? setGroupCondition : undefined}
          onAddFieldOption={mode === "staff" ? addFieldOption : undefined}
          onSetDefaultStatusFilter={mode === "staff" ? setDefaultStatusFilter : undefined}
          onCustomizeColumns={mode === "staff" ? customizeColumns : undefined}
          onRevertColumns={mode === "staff" ? revertColumns : undefined}
          onMoveItem={mode === "staff" ? moveItem : undefined}
          onRemoveItem={mode === "staff" ? removeItem : undefined}
          onAddNote={addNote}
          onAddEmail={mode === "staff" ? appendEmail : undefined}
          onRemoveEmail={mode === "staff" ? removeEmail : undefined}
          onGenerateSummary={mode === "staff" ? generateSummary : undefined}
          onSummarizeOpenMatters={mode === "staff" ? summarizeOpenMatters : undefined}
          onClearSummaries={mode === "staff" ? clearSummaries : undefined}
          onRenameMatter={mode === "staff" ? renameMatter : undefined}
          onReorderFields={mode === "staff" ? reorderFields : undefined}
          onDataChanged={reloadStaffBoard}
          onDateFormatChanged={changeDateFormat}
          onFreezeFirstColumnChanged={mode === "staff" ? changeFreezeColumn : undefined}
          onAddFormatRule={mode === "staff" ? addFormatRule : undefined}
          onUpdateFormatRule={mode === "staff" ? updateFormatRule : undefined}
          onRemoveFormatRule={mode === "staff" ? removeFormatRule : undefined}
        />
      </div>
    </div>
  );
}
