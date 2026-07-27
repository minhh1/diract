// app/public/updates/[slug]/page.tsx
// Dual-mode: a logged-in staff member of the page's own company gets the
// full editable board right here (no PIN, values/groups/matters/columns
// all editable, right on this page -- Settings only manages the page
// itself: create/revoke/PIN) via the authenticated by-slug route; anyone
// else -- no session, or a session that isn't a member of this company --
// falls back to the original genuinely-unauthenticated, PIN-gated, read +
// note-only flow (app/public/documents/[pageId]/page.tsx's PIN-cache
// pattern). The one supabase.auth call this file makes is used only to
// *detect* a staff session -- every subsequent public-side read/write
// still goes through the zero-auth public API routes exactly as before,
// so an anonymous client's experience is unchanged.
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import MatterBoard, { type MatterBoardField, type MatterBoardGroup, type MatterBoardItem } from "@/components/clientUpdatePages/MatterBoard";

interface Board { groups: MatterBoardGroup[]; items: MatterBoardItem[]; fields: MatterBoardField[]; }
interface PageMeta { title: string; dateFormat: string }

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

export default function ClientUpdatePage() {
  const params = useParams();
  const slug = params.slug as string;

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
        setMeta({ title: attempt.json.title, dateFormat: attempt.json.dateFormat });
        setBoard({ groups: attempt.json.groups, items: attempt.json.items, fields: attempt.json.fields });
        setLoading(false);
        return;
      }
      clearCachedCode(slug);
    }
    const { ok, json } = await fetchPublic();
    if (!ok) { setError(json.error || "This page is not available"); setLoading(false); return; }
    setMode("client");
    setMeta({ title: json.title, dateFormat: json.dateFormat });
    if (json.requiresCode) { setNeedsCode(true); setLoading(false); return; }
    setBoard({ groups: json.groups, items: json.items, fields: json.fields });
    setLoading(false);
  }, [fetchPublic, slug]);

  // ── Try staff auth first; anything short of a clean 200 falls back ────
  const loadAsStaff = useCallback(async () => {
    const res = await fetch(`/api/client-update-pages/by-slug/${slug}`);
    if (!res.ok) return false;
    const json = await res.json();
    setMode("staff");
    setStaffPageId(json.page.id);
    setMeta({ title: json.page.title, dateFormat: json.page.date_format });
    setBoard({ groups: json.groups, items: json.items, fields: json.fields });
    return true;
  }, [slug]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user && await loadAsStaff()) { setLoading(false); return; }
    await loadAsClient();
  }, [loadAsStaff, loadAsClient]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (meta?.title) document.title = meta.title; }, [meta?.title]);

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
    setBoard({ groups: json.groups, items: json.items, fields: json.fields });
  };

  // ── Optimistic mutation handlers ───────────────────────────────────
  // In staff mode these hit the same authenticated admin routes the
  // Settings editor uses (cookie session carries auth); in client mode
  // only note-adding is wired up at all (MatterBoard gets canEdit=false).
  const saveValue = (itemId: string, fieldId: string, value: any) => {
    if (mode !== "staff" || !staffPageId) return;
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [fieldId]: value } } : i) });
    fetch(`/api/client-update-pages/${staffPageId}/values`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, fieldId, value }),
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

  const addNote = (itemId: string, note: string) => {
    if (!note.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const source: "staff" | "client" = mode === "staff" ? "staff" : "client";
    const optimisticNote = { id: tempId, note_date: new Date().toISOString().slice(0, 10), body: note.trim(), author_name: mode === "staff" ? "You" : null, source };
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notes: [optimisticNote, ...i.notes] } : i) });

    const request = mode === "staff" && staffPageId
      ? fetch(`/api/client-update-pages/${staffPageId}/notes`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, note }),
        })
      : fetch(`/api/client-update-pages/public/${slug}/notes`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, note, code: getCachedCode(slug) }),
        });

    request.then(r => r.ok ? r.json() : null).then(json => {
      if (json?.note) setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notes: i.notes.map(n => n.id === tempId ? json.note : n) } : i) });
    });
  };

  const changeDateFormat = (format: string) => {
    if (mode !== "staff" || !staffPageId) return;
    setMeta(prev => prev && { ...prev, dateFormat: format });
    fetch(`/api/client-update-pages/${staffPageId}/date-format`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFormat: format }),
    });
  };

  // Matters added or columns changed via their modals write straight to the
  // server (new rows need real ids) -- simplest to just reload the board
  // afterward rather than hand-reconcile every possible shape.
  const reloadStaffBoard = () => { if (mode === "staff") loadAsStaff(); };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
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
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <h1 className="text-[16px] font-bold text-slate-800">{meta.title}</h1>

        <MatterBoard
          pageId={mode === "staff" ? staffPageId! : undefined}
          groups={board.groups}
          items={board.items}
          fields={board.fields}
          dateFormat={meta.dateFormat}
          canEdit={mode === "staff"}
          canComment
          onSaveValue={mode === "staff" ? saveValue : undefined}
          onRenameGroup={mode === "staff" ? renameGroup : undefined}
          onDeleteGroup={mode === "staff" ? deleteGroup : undefined}
          onAddGroup={mode === "staff" ? addGroup : undefined}
          onMoveItem={mode === "staff" ? moveItem : undefined}
          onRemoveItem={mode === "staff" ? removeItem : undefined}
          onAddNote={addNote}
          onDataChanged={reloadStaffBoard}
          onDateFormatChanged={changeDateFormat}
        />
      </div>
    </div>
  );
}
