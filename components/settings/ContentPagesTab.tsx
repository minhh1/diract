// components/settings/ContentPagesTab.tsx
// AI-authored "content pages" (see supabase/migrations/20260808080000_company_pages.sql,
// lib/pages/blockTypes.ts). List + builder: a prompt box drafts a page's
// content as structured blocks via /api/pages (create) or
// /api/pages/[id]/generate (redraft an existing page); a manual block
// editor lets a draft be hand-corrected without re-prompting. The preview
// renders through the exact same <PageBlocks> component the public page
// itself uses (components/pages/PageBlockRenderer.tsx), so what's shown
// here is exactly what gets published -- never an approximation.
//
// Creating/editing/publishing is admin-only (mirrors lib/ai/tableBuilderTools.ts's
// ADMIN_ONLY_TOOLS convention for anything content-defining) -- non-admins
// see the list read-only.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, Lock, Plus, X, Trash2, Wand2, ChevronUp, ChevronDown, ArrowLeft, Globe, Users, KeyRound, Link2, AlertTriangle } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { PageBlocks } from "@/components/pages/PageBlockRenderer";
import type { PageBlockType } from "@/lib/pages/blockTypes";
import type { ResolvedPageBlock } from "@/lib/pages/resolveRecordBlocks";

interface PageSummary {
  id: string;
  title: string;
  slug: string;
  visibility: "company" | "client" | "public";
  status: "draft" | "published";
  updated_at: string;
}

interface LinkedMatter {
  id: string;
  name: string;
  status: string;
}

interface PageDetail extends PageSummary {
  access_code: string | null;
  project_id: string | null;
  project: LinkedMatter | null;
  linkedMatters: LinkedMatter[];
  blocks: ResolvedPageBlock[];
}

// True if any block (including nested inside a columns layout) shows real
// matter data -- used to decide whether the public-exposure warning below
// should show.
function hasRecordBlocks(blocks: ResolvedPageBlock[]): boolean {
  return blocks.some((b) => b.type === "record_field" || b.type === "record_list" || b.type === "matter_list" || (b.type === "columns" && b.columns.some((col) => hasRecordBlocks(col))));
}

// applied marks an assistant reply that came WITH drafted content (the
// model called set_page_blocks) versus a clarifying question or options +
// a recommendation, which just sits in the thread with nothing to apply.
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  applied?: boolean;
}

function AdminOnlyNote() {
  return <span className="flex items-center gap-1 text-[10px] text-slate-300"><Lock size={10} /> Admin only</span>;
}

const VISIBILITY_META: Record<PageSummary["visibility"], { label: string; icon: typeof Globe }> = {
  company: { label: "Firm only", icon: Users },
  client: { label: "Client link (PIN)", icon: KeyRound },
  public: { label: "Public", icon: Globe },
};

// "columns" is deliberately left out of the manual add-block menu -- it's
// fully supported end to end (AI can generate it, it renders and saves
// fine, see PageBlockRenderer.tsx), just not hand-editable field-by-field
// in this first version of the editor. A generated columns block still
// shows in the list (movable/deletable), it just isn't a menu option here.
const ADDABLE_TYPES: { type: PageBlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "list", label: "List" },
  { type: "quote", label: "Quote" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
];

function newBlockId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function blankBlock(type: PageBlockType): ResolvedPageBlock {
  switch (type) {
    case "heading": return { id: newBlockId(), type, level: 2, text: "" };
    case "paragraph": return { id: newBlockId(), type, text: "" };
    case "image": return { id: newBlockId(), type, url: "", alt: "" };
    case "button": return { id: newBlockId(), type, label: "", url: "" };
    case "list": return { id: newBlockId(), type, style: "bullet", items: [] };
    case "quote": return { id: newBlockId(), type, text: "" };
    case "spacer": return { id: newBlockId(), type, size: "md" };
    case "columns": return { id: newBlockId(), type, columns: [[], []] };
    case "divider":
    default: return { id: newBlockId(), type: "divider" };
  }
}

const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400";
const labelCls = "text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5";

function BlockEditor({ block, onChange, onRemove, onMove, isFirst, isLast }: {
  block: ResolvedPageBlock;
  onChange: (next: ResolvedPageBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const header = (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{block.type}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onMove(-1)} disabled={isFirst} className="p-1.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"><ChevronUp size={14} /></button>
        <button onClick={() => onMove(1)} disabled={isLast} className="p-1.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"><ChevronDown size={14} /></button>
        <button onClick={onRemove} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
      </div>
    </div>
  );

  let fields: React.ReactNode;
  switch (block.type) {
    case "heading":
      fields = (
        <div className="flex gap-2">
          <select value={block.level} onChange={e => onChange({ ...block, level: Number(e.target.value) as 2 | 3 })} className={`${inputCls} w-20 bg-white`}>
            <option value={2}>H2</option><option value={3}>H3</option>
          </select>
          <input type="text" value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} placeholder="Heading text" className={inputCls} />
        </div>
      );
      break;
    case "paragraph":
      fields = <textarea value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} placeholder="Paragraph text" rows={3} className={inputCls} />;
      break;
    case "image":
      fields = (
        <div className="space-y-2">
          <input type="text" value={block.url} onChange={e => onChange({ ...block, url: e.target.value })} placeholder="https://..." className={inputCls} />
          <input type="text" value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Alt text" className={inputCls} />
        </div>
      );
      break;
    case "button":
      fields = (
        <div className="flex gap-2">
          <input type="text" value={block.label} onChange={e => onChange({ ...block, label: e.target.value })} placeholder="Button label" className={inputCls} />
          <input type="text" value={block.url} onChange={e => onChange({ ...block, url: e.target.value })} placeholder="https://..." className={inputCls} />
        </div>
      );
      break;
    case "list":
      fields = (
        <div className="space-y-2">
          <select value={block.style} onChange={e => onChange({ ...block, style: e.target.value as "bullet" | "number" })} className={`${inputCls} w-32 bg-white`}>
            <option value="bullet">Bullets</option><option value="number">Numbered</option>
          </select>
          <textarea value={block.items.join("\n")} onChange={e => onChange({ ...block, items: e.target.value.split("\n") })} placeholder={"One item per line"} rows={4} className={inputCls} />
        </div>
      );
      break;
    case "quote":
      fields = (
        <div className="space-y-2">
          <textarea value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} placeholder="Quote text" rows={2} className={inputCls} />
          <input type="text" value={block.attribution || ""} onChange={e => onChange({ ...block, attribution: e.target.value })} placeholder="Attribution (optional)" className={inputCls} />
        </div>
      );
      break;
    case "spacer":
      fields = (
        <select value={block.size} onChange={e => onChange({ ...block, size: e.target.value as "sm" | "md" | "lg" })} className={`${inputCls} w-32 bg-white`}>
          <option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option>
        </select>
      );
      break;
    case "columns":
      fields = <p className="text-[11px] text-slate-400">{block.columns.length} column layout. Regenerate the page to change it -- not hand-editable here yet.</p>;
      break;
    case "record_field":
      fields = (
        <p className="text-[11px] text-slate-400">
          Shows &quot;{block.label}&quot; from the linked matter -- currently <span className="font-medium text-slate-600">{block.resolvedValue || "not available"}</span>. Ask us to change or remove this -- not hand-editable here yet.
        </p>
      );
      break;
    case "record_list":
      fields = (
        <p className="text-[11px] text-slate-400">
          Lists related records from &quot;{block.title}&quot; ({block.resolvedRows.length} shown). Ask us to change or remove this -- not hand-editable here yet.
        </p>
      );
      break;
    case "matter_list":
      fields = (
        <p className="text-[11px] text-slate-400">
          Lists linked matters as &quot;{block.title}&quot; ({block.resolvedRows.length} shown). Ask us to change or remove this -- not hand-editable here yet.
        </p>
      );
      break;
    case "divider":
    default:
      fields = <p className="text-[11px] text-slate-300">A horizontal divider line.</p>;
  }

  return <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">{header}{fields}</div>;
}

export default function ContentPagesTab() {
  const { isAdmin } = useCompany();
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [matterQuery, setMatterQuery] = useState("");
  const [matterResults, setMatterResults] = useState<LinkedMatter[]>([]);
  const [matterSearching, setMatterSearching] = useState(false);

  const searchMatters = (q: string) => {
    setMatterQuery(q);
    if (!q.trim()) { setMatterResults([]); return; }
    setMatterSearching(true);
    fetch(`/api/projects/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(j => setMatterResults((j.projects || []).slice(0, 8)))
      .finally(() => setMatterSearching(false));
  };

  const fetchPages = useCallback(() => fetch("/api/pages").then(r => r.json()).then(j => setPages(j.pages || [])), []);

  // Initial load relies on loadingList's own useState(true) default rather
  // than setting it true again here -- calling setState synchronously in an
  // effect body (as opposed to inside a .then/.finally callback) trips this
  // codebase's react-hooks/set-state-in-effect lint rule. loadList below
  // (called only from event handlers -- create/delete -- never from an
  // effect) is where a manual refresh explicitly flips it back to true.
  useEffect(() => { fetchPages().finally(() => setLoadingList(false)); }, [fetchPages]);

  const loadList = () => {
    setLoadingList(true);
    fetchPages().finally(() => setLoadingList(false));
  };

  // Same reasoning as above -- detail starts null, so switching pages just
  // needs the click handlers below (setActiveId) to also clear it
  // synchronously (fine there -- event handlers, not effects); this effect
  // only ever populates it once the fetch resolves, never synchronously.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/pages/${activeId}`).then(r => r.json()).then(j => { if (!cancelled) setDetail(j.page || null); });
    return () => { cancelled = true; };
  }, [activeId]);

  const createPage = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/pages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) { setError(json.error || "Failed to create page"); return; }
    const initialPrompt = newPrompt.trim();
    setNewTitle(""); setNewPrompt("");
    loadList();
    setDetail(null);
    setChatMessages([]);
    setActiveId(json.page.id);
    if (initialPrompt) sendChatMessage(json.page.id, initialPrompt, []);
  };

  // pageId/priorMessages are passed explicitly rather than read from
  // activeId/chatMessages state -- createPage calls this right after
  // setActiveId(json.page.id), and React state updates aren't visible to
  // the same closure until the next render, so reading activeId here would
  // still see the PREVIOUS page (or null).
  const sendChatMessage = async (pageId: string, text: string, priorMessages: ChatMsg[]) => {
    const trimmed = text.trim();
    if (!pageId || !trimmed) return;
    const withUser: ChatMsg[] = [...priorMessages, { role: "user", content: trimmed }];
    setChatMessages(withUser);
    setChatInput("");
    setSending(true);
    setError(null);
    const res = await fetch(`/api/pages/${pageId}/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: withUser.map(({ role, content }) => ({ role, content })) }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) { setError(json.error || "Something went wrong"); return; }
    const applied = !!json.page;
    setChatMessages(m => [...m, { role: "assistant", content: json.message || (applied ? "Drafted." : "Sorry, something went wrong."), applied }]);
    if (applied) setDetail(d => d ? { ...d, blocks: json.page.blocks, linkedMatters: json.page.linkedMatters ?? d.linkedMatters } : d);
  };

  const save = async () => {
    if (!activeId || !detail) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/pages/${activeId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: detail.title, visibility: detail.visibility, accessCode: detail.access_code, status: detail.status,
        projectId: detail.project_id, blocks: detail.blocks, linkedProjectIds: detail.linkedMatters.map(m => m.id),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to save"); return; }
    setDetail(d => d ? { ...d, ...json.page } : d);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    loadList();
  };

  const deletePage = async (id: string) => {
    if (!window.confirm("Delete this page? This can't be undone from here.")) return;
    await fetch(`/api/pages/${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    loadList();
  };

  const updateBlock = (index: number, next: ResolvedPageBlock) => {
    setDetail(d => d ? { ...d, blocks: d.blocks.map((b, i) => i === index ? next : b) } : d);
  };
  const removeBlock = (index: number) => {
    setDetail(d => d ? { ...d, blocks: d.blocks.filter((_, i) => i !== index) } : d);
  };
  const moveBlock = (index: number, dir: -1 | 1) => {
    setDetail(d => {
      if (!d) return d;
      const next = [...d.blocks];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, blocks: next };
    });
  };
  const addBlock = (type: PageBlockType) => {
    setDetail(d => d ? { ...d, blocks: [...d.blocks, blankBlock(type)] } : d);
  };

  if (activeId) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setDetail(null); setChatMessages([]); setActiveId(null); }} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft size={13} /> All pages
        </button>

        {!detail ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-300" size={20} /></div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Page settings</p>
                {!isAdmin && <AdminOnlyNote />}
              </div>
              <div>
                <label className={labelCls}>Title</label>
                <input type="text" disabled={!isAdmin} value={detail.title} onChange={e => setDetail(d => d ? { ...d, title: e.target.value } : d)} className={`${inputCls} disabled:opacity-60`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Visibility</label>
                  <div className="flex gap-2">
                    {(Object.keys(VISIBILITY_META) as PageSummary["visibility"][]).map(v => {
                      const Icon = VISIBILITY_META[v].icon;
                      return (
                        <button key={v} disabled={!isAdmin} onClick={() => setDetail(d => d ? { ...d, visibility: v } : d)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-60 ${detail.visibility === v ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                          <Icon size={12} /> {VISIBILITY_META[v].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <button disabled={!isAdmin} onClick={() => setDetail(d => d ? { ...d, status: d.status === "published" ? "draft" : "published" } : d)}
                    className={`px-4 py-2 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-60 ${detail.status === "published" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                    {detail.status === "published" ? "Published" : "Draft (not live)"}
                  </button>
                </div>
              </div>
              {(detail.visibility === "client" || detail.visibility === "public") && (
                <div>
                  <label className={labelCls}>
                    {detail.visibility === "client" ? "Access PIN (optional -- blank means anyone with the link can view it)" : "Access PIN (optional extra safeguard -- Public already means anyone with the link can view it, with or without a PIN)"}
                  </label>
                  <input type="text" disabled={!isAdmin} value={detail.access_code || ""} onChange={e => setDetail(d => d ? { ...d, access_code: e.target.value } : d)} placeholder="123456" className={`${inputCls} w-40 disabled:opacity-60`} />
                </div>
              )}
              {detail.visibility === "public" && !detail.access_code && (
                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">Public pages have no PIN by default -- anyone with the link can view this once published. Add a PIN above for an extra safeguard, or switch to Client link.</p>
              )}
              <p className="text-[10px] text-slate-400">URL: <code className="px-1.5 py-0.5 bg-slate-50 rounded text-[11px]">/public/pages/{detail.slug}</code></p>

              <div className="pt-2 border-t border-slate-100">
                <label className={labelCls}>Link to a matter (optional -- lets us show real data from it)</label>
                {detail.project ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl w-fit">
                    <Link2 size={13} className="text-slate-400" />
                    <span className="text-[12px] font-medium text-slate-700">{detail.project.name}</span>
                    <span className="text-[10px] text-slate-400">{detail.project.status}</span>
                    {isAdmin && (
                      <button onClick={() => setDetail(d => d ? { ...d, project_id: null, project: null } : d)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={13} /></button>
                    )}
                  </div>
                ) : isAdmin ? (
                  <div className="relative w-72">
                    <input type="text" value={matterQuery} onChange={e => searchMatters(e.target.value)} placeholder="Search matters by name..." className={inputCls} />
                    {matterQuery.trim() && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-sm max-h-56 overflow-y-auto">
                        {matterSearching ? (
                          <div className="p-3 flex justify-center"><Loader2 size={14} className="animate-spin text-slate-300" /></div>
                        ) : matterResults.length === 0 ? (
                          <p className="p-3 text-[11px] text-slate-400">No matching matters.</p>
                        ) : (
                          matterResults.map(m => (
                            <button key={m.id} onClick={() => { setDetail(d => d ? { ...d, project_id: m.id, project: m } : d); setMatterQuery(""); setMatterResults([]); }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors">
                              <span className="text-[12px] font-medium text-slate-700">{m.name}</span>
                              <span className="ml-2 text-[10px] text-slate-400">{m.status}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">Not linked to a matter.</p>
                )}
              </div>

              {detail.linkedMatters.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <label className={labelCls}>Linked matters (found by us in chat -- ask us to find and link more, or remove one below)</label>
                  <div className="flex flex-wrap gap-2">
                    {detail.linkedMatters.map(m => (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl">
                        <Link2 size={13} className="text-slate-400" />
                        <span className="text-[12px] font-medium text-slate-700">{m.name}</span>
                        <span className="text-[10px] text-slate-400">{m.status}</span>
                        {isAdmin && (
                          <button onClick={() => setDetail(d => d ? { ...d, linkedMatters: d.linkedMatters.filter(x => x.id !== m.id) } : d)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={13} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.visibility === "public" && hasRecordBlocks(detail.blocks) && (
                <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl p-3">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>This page shows real matter data and is set to fully Public. Anyone with the link can see it{detail.access_code ? ", though it does require the PIN above." : ", with no PIN required."} Consider switching to Client link (PIN), or add a PIN above.</span>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Draft with us</p>
                {chatMessages.length > 0 && (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[12px] whitespace-pre-wrap ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700 border border-slate-100"}`}>
                          {m.content}
                          {m.applied && (
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-emerald-500"><Check size={10} /> Applied to the page below</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {sending && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl px-4 py-2.5 bg-slate-50 border border-slate-100"><Loader2 size={13} className="animate-spin text-slate-300" /></div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !sending) sendChatMessage(activeId, chatInput, chatMessages); }}
                    placeholder={chatMessages.length ? "Reply..." : "Describe the page you want, e.g. 'A short overview of our conveyancing service, with a heading, two paragraphs, and a Book a consult button linking to our contact page.'"}
                    className={inputCls} />
                  <button onClick={() => sendChatMessage(activeId, chatInput, chatMessages)} disabled={sending || !chatInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0">
                    {sending ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Send
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">I might ask a clarifying question or suggest a direction before drafting -- review and hand-edit the content below afterward before publishing.</p>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Content</p>
              <div className="space-y-3">
                {detail.blocks.map((block, i) => (
                  <BlockEditor key={block.id} block={block}
                    onChange={next => updateBlock(i, next)} onRemove={() => removeBlock(i)}
                    onMove={dir => moveBlock(i, dir)} isFirst={i === 0} isLast={i === detail.blocks.length - 1} />
                ))}
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  {ADDABLE_TYPES.map(t => (
                    <button key={t.type} onClick={() => addBlock(t.type)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                      <Plus size={11} /> {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save page
                </button>
                {saved && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</span>}
              </div>
            )}

            {error && <p className="text-[11px] text-red-500 px-2">{error}</p>}

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Live preview</p>
              <div className="bg-white rounded-2xl p-6 border border-slate-100">
                <PageBlocks blocks={detail.blocks} />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New page</p>
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Page title, e.g. 'Conveyancing services'" className={inputCls} />
          <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} rows={2} placeholder="Optional: describe the content and I'll draft it -- you can leave this blank and build it manually instead." className={inputCls} />
          <button onClick={createPage} disabled={creating || !newTitle.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create page
          </button>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-[40px] p-8">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Pages</p>
        {loadingList ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-slate-300" size={20} /></div>
        ) : pages.length === 0 ? (
          <p className="text-[12px] text-slate-400">No pages yet.</p>
        ) : (
          <div className="space-y-2">
            {pages.map(p => {
              const Icon = VISIBILITY_META[p.visibility].icon;
              return (
                <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors">
                  <button onClick={() => { setDetail(null); setChatMessages([]); setActiveId(p.id); }} className="flex-1 text-left flex items-center gap-3">
                    <span className="text-[13px] font-medium text-slate-700">{p.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${p.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{p.status}</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><Icon size={11} /> {VISIBILITY_META[p.visibility].label}</span>
                  </button>
                  {isAdmin && <button onClick={() => deletePage(p.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><X size={14} /></button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
