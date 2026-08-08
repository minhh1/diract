"use client";

// Per-widget configuration modal, opened from a widget's gear icon in
// CanvasEditor. Reuses the same controls the old fixed-form builder page
// had for each config type (quick-add/grid/filter field pickers, summary
// tile label/field/aggregate/condition, chart date/value/aggregate) --
// just scoped to one widget at a time instead of one long form.
import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import FieldPickerList from "./FieldPickerList";
import RelationPicker from "../RelationPicker";
import { useCompany } from "@/components/CompanyContext";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import type { DashboardWidget, SummaryTileWidget, TileCondition, ChartSeriesConfig } from "@/lib/dashboardWidgets/types";
import { isRelationType, isNumericType, isDateType, operatorsForType, aggregatesForType } from "@/lib/schema/fieldCapabilities";
import { PILL_SIZE_LABELS, PILL_GAP_LABELS, type PillSize, type PillGap, type FieldWidth } from "@/lib/dashboardWidgets/pillSize";
import { RELATIVE_DATE_RANGES, RELATIVE_DATE_LABELS } from "@/lib/dashboardWidgets/relativeDates";
import { PUBLIC_TASK_COLUMNS, SCOPE_LABELS } from "@/lib/publicTaskColumns";
import { useCompanyCustomFields } from "@/lib/hooks/useCompanyCustomFields";
import { TAX_SCHEMES } from "@/lib/invoices/taxSchemes";

// Grid columns store a raw pixel width (GridWidget.config.columnWidths),
// unlike filter_bar/quick_add_form's category-based fieldLayout -- these
// map FieldPickerList's shared width selector onto pixel values so the
// same control/UI works for both instead of building a second one.
const GRID_WIDTH_PX: Record<FieldWidth, number> = { sm: 100, md: 160, lg: 260, full: 420 };
function widthCategoryFromPx(px: number): FieldWidth {
  let closest: FieldWidth = 'md';
  let closestDiff = Infinity;
  for (const [width, value] of Object.entries(GRID_WIDTH_PX) as [FieldWidth, number][]) {
    const diff = Math.abs(value - px);
    if (diff < closestDiff) { closest = width; closestDiff = diff; }
  }
  return closest;
}

// Widget-level size/spacing for a filter_bar or quick_add_form's controls
// (RelationPicker/date/select/text inputs) -- see lib/dashboardWidgets/
// pillSize.ts. Two button groups rather than a select, matching the
// granularity buttons already used for the chart widget below.
function PillStyleControls({
  pillSize, pillGap, onChange,
}: {
  pillSize?: PillSize;
  pillGap?: PillGap;
  onChange: (patch: { pillSize?: PillSize; pillGap?: PillGap }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Size</label>
        <div className="flex gap-1.5">
          {(Object.keys(PILL_SIZE_LABELS) as PillSize[]).map(v => (
            <button
              key={v}
              onClick={() => onChange({ pillSize: v })}
              className={`flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                (pillSize ?? 'md') === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              }`}
            >
              {PILL_SIZE_LABELS[v]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Spacing</label>
        <div className="flex gap-1.5">
          {(Object.keys(PILL_GAP_LABELS) as PillGap[]).map(v => (
            <button
              key={v}
              onClick={() => onChange({ pillGap: v })}
              className={`flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                (pillGap ?? 'normal') === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              }`}
            >
              {PILL_GAP_LABELS[v]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PublicTaskPageSummary {
  id: string; title: string; scope: string; teamName: string | null;
  columns: string[]; expiresAt: string | null; isActive: boolean;
}

// Creates/manages the public_task_pages row a PublicTaskPageWidget owns
// (see lib/dashboardWidgets/types.ts) -- unlike every other widget's config,
// this one makes real API calls from inside the config panel itself
// (Settings -> Public task pages' own create flow works the same way),
// since there's nothing meaningful to preview locally before the page
// actually exists server-side. Beyond create/copy/revoke, also supports
// editing the current page's title/columns/expiry in place (PATCH
// /settings, doesn't change the URL) and switching the widget to point at
// a DIFFERENT one of the caller's existing pages (mirrors
// PublicDocumentPageConfig's picker below).
function PublicTaskPageConfig({ pageId, onPageIdChange }: { pageId: string | null; onPageIdChange: (id: string) => void }) {
  const [pages, setPages] = useState<PublicTaskPageSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'picker'>('view');
  const [editTitle, setEditTitle] = useState('');
  const [editColumns, setEditColumns] = useState<string[]>([]);
  const [editNoExpiry, setEditNoExpiry] = useState(true);
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // "Matter number" is a per-company custom field on Projects, not
  // universal -- see components/settings/PublicTaskPagesTab.tsx's matching
  // comment.
  const { fields: projectFields } = useCompanyCustomFields('projects');
  const hasMatterNumberField = projectFields.some(f => f.field_key === 'matter_number');
  const availablePublicTaskColumns = PUBLIC_TASK_COLUMNS.filter(c => c.key !== 'matter_number' || hasMatterNumberField);

  useEffect(() => {
    let active = true;
    fetch('/api/public-tasks/list').then(res => res.json()).then(json => {
      if (active) setPages(json.pages || []);
    });
    return () => { active = false; };
  }, []);

  const currentPage = pages?.find(p => p.id === pageId) || null;

  const startEdit = () => {
    if (currentPage) {
      setEditTitle(currentPage.title);
      setEditColumns(currentPage.columns || []);
      setEditNoExpiry(!currentPage.expiresAt);
      setEditExpiresAt(currentPage.expiresAt || '');
    }
    setEditError(null);
    setMode('edit');
  };

  const toggleEditColumn = (key: string) => setEditColumns(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);

  const handleCreate = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    const res = await fetch('/api/public-tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, scope: 'my_and_unassigned',
        columns: ['project_name', 'due_date', 'status'],
        expiresAt: null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || 'Failed to create page'); return; }
    setPages(prev => [...(prev || []), {
      id: json.pageId, title, scope: 'my_and_unassigned', teamName: null,
      columns: ['project_name', 'due_date', 'status'], expiresAt: null, isActive: true,
    }]);
    onPageIdChange(json.pageId);
  };

  const handleSaveEdit = async () => {
    if (!pageId) return;
    if (!editTitle.trim()) { setEditError('Title is required'); return; }
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/public-tasks/${pageId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, columns: editColumns, expiresAt: editNoExpiry ? null : (editExpiresAt || null) }),
    });
    const json = await res.json();
    setEditSaving(false);
    if (!res.ok) { setEditError(json.error || 'Failed to save'); return; }
    setPages(prev => prev ? prev.map(p => p.id === pageId ? { ...p, title: editTitle, columns: editColumns, expiresAt: editNoExpiry ? null : editExpiresAt } : p) : prev);
    setMode('view');
  };

  const handleRevoke = async () => {
    if (!pageId || !window.confirm('Revoke this page? The link will stop working immediately.')) return;
    setRevoking(true);
    await fetch(`/api/public-tasks/${pageId}/revoke`, { method: 'PATCH' });
    setRevoking(false);
    setRevoked(true);
  };

  if (!pageId && mode === 'picker') {
    const activePages = (pages || []).filter(p => p.isActive);
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">Pick one of your existing public task pages to point this widget at.</p>
        {activePages.length === 0 ? (
          <p className="text-[11px] text-slate-300 italic py-2">No active pages yet</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {activePages.map(p => (
              <button
                key={p.id}
                onClick={() => { onPageIdChange(p.id); setMode('view'); }}
                className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors"
              >
                <p className="text-[12px] font-bold text-slate-800 truncate">{p.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{SCOPE_LABELS[p.scope] || p.scope}{p.teamName ? ` (${p.teamName})` : ''}</p>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMode('view')}
          className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-slate-300 transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (!pageId) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">
          Shows tasks assigned to whoever opens this page, plus unallocated ones. Anyone with the link can also assign a new task to any company member, not just themself. Only visible/actionable within projects the viewer has access to.
        </p>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. My tasks"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {saving ? 'Creating...' : 'Create page'}
        </button>
        {pages && pages.filter(p => p.isActive).length > 0 && (
          <button
            onClick={() => setMode('picker')}
            className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all"
          >
            Use an existing page instead
          </button>
        )}
      </div>
    );
  }

  if (mode === 'picker') {
    const otherPages = (pages || []).filter(p => p.isActive && p.id !== pageId);
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">Point this widget at a different existing page. The widget itself is unaffected; revoke and copy still apply to whichever page you pick.</p>
        {pages === null ? (
          <p className="text-[11px] text-slate-300 italic py-2">Loading...</p>
        ) : otherPages.length === 0 ? (
          <p className="text-[11px] text-slate-300 italic py-2">No other active pages to switch to</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {otherPages.map(p => (
              <button
                key={p.id}
                onClick={() => { onPageIdChange(p.id); setMode('view'); }}
                className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors"
              >
                <p className="text-[12px] font-bold text-slate-800 truncate">{p.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{SCOPE_LABELS[p.scope] || p.scope}{p.teamName ? ` (${p.teamName})` : ''}</p>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMode('view')}
          className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-slate-300 transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Title</label>
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Columns to show</label>
          <div className="flex flex-wrap gap-2">
            {availablePublicTaskColumns.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleEditColumn(c.key)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                  editColumns.includes(c.key) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Expiry date</label>
          <input
            type="date"
            value={editExpiresAt}
            onChange={e => setEditExpiresAt(e.target.value)}
            disabled={editNoExpiry}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none disabled:opacity-40"
          />
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={editNoExpiry} onChange={e => setEditNoExpiry(e.target.checked)} />
            <span className="text-[11px] text-slate-500">No expiry</span>
          </label>
        </div>
        {editError && <p className="text-[11px] text-red-500 font-medium">{editError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSaveEdit}
            disabled={editSaving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {editSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setMode('view')}
            className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-slate-300 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const url = typeof window !== 'undefined' ? `${window.location.origin}/public/tasks/${pageId}` : `/public/tasks/${pageId}`;
  return (
    <div className="space-y-3">
      {revoked ? (
        <p className="text-[11px] text-red-500 font-medium">Revoked. The link no longer works.</p>
      ) : (
        <>
          <div className="px-4 py-3 bg-slate-50 rounded-2xl">
            <code className="text-[11px] text-slate-600 break-all">{url}</code>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={startEdit}
              className="flex-1 py-2.5 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
            >
              Edit
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('picker')}
              className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all"
            >
              Change page
            </button>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-all"
            >
              {revoking ? 'Revoking...' : 'Revoke'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Points a PublicDocumentPageWidget at one of the company's existing active
// document_fill_pages rows (see lib/dashboardWidgets/types.ts). Unlike
// PublicTaskPageConfig above, this never creates a page itself -- a fill
// page needs a project + selected templates chosen up front (see
// DocumentTemplatesTab.tsx's "Generate client link"), which this panel has
// no context for. It only lists+links to ones that already exist.
function PublicDocumentPageConfig({ pageId, onPageIdChange }: { pageId: string | null; onPageIdChange: (id: string) => void }) {
  const [pages, setPages] = useState<{ id: string; title: string; clientName: string | null; projectName: string | null }[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/document-templates/pages').then(res => res.json()).then(json => {
      if (active) setPages(json.pages || []);
    });
    return () => { active = false; };
  }, []);

  if (!pageId) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">
          Links to an existing client document link. Generate one first from a matter's Documents tab, then pick it here.
        </p>
        {pages === null ? (
          <p className="text-[11px] text-slate-300 italic py-2">Loading...</p>
        ) : pages.length === 0 ? (
          <p className="text-[11px] text-slate-300 italic py-2">No active document links yet. Generate one from a matter's Documents tab first.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {pages.map(p => (
              <button
                key={p.id}
                onClick={() => onPageIdChange(p.id)}
                className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors"
              >
                <p className="text-[12px] font-bold text-slate-800 truncate">{p.title}{p.clientName ? ` (${p.clientName})` : ''}</p>
                {p.projectName && <p className="text-[10px] text-slate-400 truncate">{p.projectName}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const selected = pages?.find(p => p.id === pageId);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/public/documents/${pageId}` : `/public/documents/${pageId}`;
  return (
    <div className="space-y-3">
      {selected && <p className="text-[12px] font-bold text-slate-800">{selected.title}{selected.clientName ? ` (${selected.clientName})` : ''}</p>}
      <div className="px-4 py-3 bg-slate-50 rounded-2xl">
        <code className="text-[11px] text-slate-600 break-all">{url}</code>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          onClick={() => onPageIdChange('')}
          className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-slate-300 transition-all"
        >
          Change
        </button>
      </div>
    </div>
  );
}

interface ClientUpdatePageSummary {
  id: string; title: string; client_label: string | null; slug: string;
  access_code: string | null; is_active: boolean; expires_at: string | null; matterCount: number;
}

// Creates/manages the client_update_pages row a PublicClientUpdatePageWidget
// owns (see lib/dashboardWidgets/types.ts) -- same create-or-pick shape as
// PublicTaskPageConfig above, since a fresh page here only ever needs a
// title (matters/columns/groups are all added afterward directly on the
// board itself -- Settings -> Public pages' "Detailed tables" tab creates
// pages the exact same minimal way). Keyed by slug, not id, since that's
// what both the public route and this widget's embedded content address a
// page by.
function PublicClientUpdatePageConfig({ slug, onSlugChange }: { slug: string | null; onSlugChange: (slug: string) => void }) {
  const [pages, setPages] = useState<ClientUpdatePageSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [mode, setMode] = useState<'view' | 'picker'>('view');

  useEffect(() => {
    let active = true;
    fetch('/api/client-update-pages/list').then(res => res.json()).then(json => {
      if (active) setPages(json.pages || []);
    });
    return () => { active = false; };
  }, []);

  const currentPage = pages?.find(p => p.slug === slug) || null;

  const handleCreate = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    // Quick-create here always starts as a plain public Matters page --
    // picking a different table/visibility is a Settings -> Public pages ->
    // "Detailed tables" job (see ClientUpdatePagesTab.tsx's full create
    // flow); this widget only ever points at an already-configured page's
    // slug, so its own create shortcut stays minimal on purpose.
    const res = await fetch('/api/client-update-pages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, baseTable: 'projects', fields: [], visibility: 'public' }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || 'Failed to create page'); return; }
    setPages(prev => [...(prev || []), {
      id: json.page.id, title, client_label: null, slug: json.page.slug,
      access_code: json.page.access_code, is_active: true, expires_at: null, matterCount: 0,
    }]);
    onSlugChange(json.page.slug);
  };

  const handleRevoke = async () => {
    if (!currentPage || !window.confirm('Revoke this page? The link will stop working immediately.')) return;
    setRevoking(true);
    await fetch(`/api/client-update-pages/${currentPage.id}/revoke`, { method: 'PATCH' });
    setRevoking(false);
    setRevoked(true);
  };

  if (!slug && mode === 'picker') {
    const activePages = (pages || []).filter(p => p.is_active);
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">Pick one of your existing detailed table pages to point this widget at.</p>
        {activePages.length === 0 ? (
          <p className="text-[11px] text-slate-300 italic py-2">No active pages yet</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {activePages.map(p => (
              <button
                key={p.id}
                onClick={() => { onSlugChange(p.slug); setMode('view'); }}
                className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors"
              >
                <p className="text-[12px] font-bold text-slate-800 truncate">{p.title}{p.client_label ? ` (${p.client_label})` : ''}</p>
                <p className="text-[10px] text-slate-400 truncate">{p.matterCount} matter{p.matterCount !== 1 ? 's' : ''}</p>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMode('view')}
          className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-slate-300 transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (!slug) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">
          A matter-status board you share with a client. Add matters, columns and groups directly on the board itself after creating it (same as the fully editable view you'll get right here, signed in). Anyone with the link enters a PIN to view and add notes.
        </p>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Smith Family Trust"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {saving ? 'Creating...' : 'Create page'}
        </button>
        {pages && pages.filter(p => p.is_active).length > 0 && (
          <button
            onClick={() => setMode('picker')}
            className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all"
          >
            Use an existing page instead
          </button>
        )}
      </div>
    );
  }

  if (mode === 'picker') {
    const otherPages = (pages || []).filter(p => p.is_active && p.slug !== slug);
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-400">Point this widget at a different existing page.</p>
        {pages === null ? (
          <p className="text-[11px] text-slate-300 italic py-2">Loading...</p>
        ) : otherPages.length === 0 ? (
          <p className="text-[11px] text-slate-300 italic py-2">No other active pages to switch to</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {otherPages.map(p => (
              <button
                key={p.id}
                onClick={() => { onSlugChange(p.slug); setMode('view'); }}
                className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors"
              >
                <p className="text-[12px] font-bold text-slate-800 truncate">{p.title}{p.client_label ? ` (${p.client_label})` : ''}</p>
                <p className="text-[10px] text-slate-400 truncate">{p.matterCount} matter{p.matterCount !== 1 ? 's' : ''}</p>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMode('view')}
          className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-slate-300 transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  const url = typeof window !== 'undefined' ? `${window.location.origin}/public/updates/${slug}` : `/public/updates/${slug}`;
  return (
    <div className="space-y-3">
      {revoked ? (
        <p className="text-[11px] text-red-500 font-medium">Revoked. The link no longer works.</p>
      ) : (
        <>
          <div className="px-4 py-3 bg-slate-50 rounded-2xl space-y-1">
            <code className="text-[11px] text-slate-600 break-all block">{url}</code>
            {currentPage?.access_code && (
              <p className="text-[11px] text-slate-400">PIN: <code className="font-bold text-slate-600">{currentPage.access_code}</code></p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={() => setMode('picker')}
              className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all"
            >
              Change page
            </button>
          </div>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="w-full py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-all"
          >
            {revoking ? 'Revoking...' : 'Revoke'}
          </button>
        </>
      )}
    </div>
  );
}

interface Props {
  widget: DashboardWidget;
  fields: CustomTableField[];
  // Every OTHER widget on this dashboard -- today only used to list summary
  // tiles a chart's "add from an existing tile" button can promote into a
  // series (see addSeriesFromTile below). Not filtered before being passed
  // in; this component does its own filtering per use.
  allWidgets: DashboardWidget[];
  onSave: (widget: DashboardWidget) => void;
  onClose: () => void;
}

function conditionNeedsValue(operator: TileCondition['operator']): boolean {
  return operator !== 'is_set' && operator !== 'is_empty';
}

// One "<field> <operator> <value>" row. The value control is type-aware --
// a Yes/No select for booleans, the real option list for selects, a
// RelationPicker for relation types, plain text/number/date inputs
// otherwise -- and hidden entirely for is_set/is_empty, which don't take one.
function ConditionRow({
  condition, fields, onChange, onRemove,
}: {
  condition: TileCondition;
  fields: CustomTableField[];
  onChange: (patch: Partial<TileCondition>) => void;
  onRemove: () => void;
}) {
  const field = fields.find(f => f.id === condition.fieldId);
  const operators = field ? operatorsForType(field.field_type) : [];

  const handleFieldChange = (fieldId: string) => {
    const nextField = fields.find(f => f.id === fieldId);
    const nextOperators = nextField ? operatorsForType(nextField.field_type) : [];
    // Switching to a field whose type doesn't support the current operator
    // (e.g. was "contains" on text, new field is a number) resets to that
    // type's first operator rather than silently keeping an invalid one.
    const stillValid = nextOperators.some(o => o.value === condition.operator);
    onChange({ fieldId, operator: stillValid ? condition.operator : (nextOperators[0]?.value ?? 'eq'), value: undefined });
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={condition.fieldId}
        onChange={e => handleFieldChange(e.target.value)}
        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none appearance-none"
      >
        <option value="">Field...</option>
        {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <select
        value={condition.operator}
        onChange={e => onChange({ operator: e.target.value as TileCondition['operator'], value: undefined })}
        disabled={!field}
        className="shrink-0 bg-slate-50 border border-slate-200 rounded-full py-2 px-2.5 text-[12px] font-medium outline-none appearance-none disabled:opacity-50"
      >
        {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {field && conditionNeedsValue(condition.operator) && (
        <div className="flex-1 min-w-0">
          {field.field_type === 'boolean' ? (
            <select
              value={condition.value === false ? 'false' : 'true'}
              onChange={e => onChange({ value: e.target.value === 'true' })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none appearance-none"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : field.field_type === 'select' ? (
            <select
              value={condition.value ?? ''}
              onChange={e => onChange({ value: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none appearance-none"
            >
              <option value="">Value...</option>
              {(field.select_options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : isRelationType(field.field_type) ? (
            <RelationPicker
              linkedSystemTable={field.linked_system_table}
              linkedTableId={field.linked_system_table ? null : field.linked_table_id}
              displayField={field.linked_display_field}
              displayField2={field.linked_display_field_2}
              value={condition.value ?? null}
              onSelect={id => onChange({ value: id })}
              placeholder="Value..."
            />
          ) : field.field_type === 'date' && condition.operator === 'date_relative' ? (
            <select
              value={condition.value ?? ''}
              onChange={e => onChange({ value: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none appearance-none"
            >
              <option value="">Range...</option>
              {RELATIVE_DATE_RANGES.map(r => <option key={r} value={r}>{RELATIVE_DATE_LABELS[r]}</option>)}
            </select>
          ) : field.field_type === 'date' ? (
            <input
              type="date"
              value={condition.value ?? ''}
              onChange={e => onChange({ value: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none"
            />
          ) : isNumericType(field.field_type) ? (
            <input
              type="number"
              value={condition.value ?? ''}
              onChange={e => onChange({ value: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Value..."
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none"
            />
          ) : (
            <input
              value={condition.value ?? ''}
              onChange={e => onChange({ value: e.target.value })}
              placeholder="Value..."
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none"
            />
          )}
        </div>
      )}
      <button onClick={onRemove} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500"><X size={13} /></button>
    </div>
  );
}

// A tile saved before multi-condition support only has the old singular
// filterFieldId/filterValue -- normalized into the new array shape the
// moment the panel opens so the rest of this component only ever deals
// with `conditions`. computeSummaryTileValue/serializeToDSL have the same
// fallback for tiles that get read/serialized without ever being reopened
// here (see lib/dashboardWidgets/compute.ts and dsl.ts).
function normalizeWidget(widget: DashboardWidget): DashboardWidget {
  if (widget.type === 'summary_tile') {
    if (widget.config.conditions) return widget;
    const conditions: TileCondition[] = widget.config.filterFieldId
      ? [{ fieldId: widget.config.filterFieldId, operator: 'eq', value: widget.config.filterValue ?? true }]
      : [];
    return { ...widget, config: { ...widget.config, conditions } };
  }
  if (widget.type === 'chart') {
    const granularity = widget.config.granularity ?? 'day';
    const series: ChartSeriesConfig[] = widget.config.series?.length
      ? widget.config.series
      : [{ label: '', valueFieldId: widget.config.valueFieldId ?? null, aggregate: widget.config.aggregate ?? 'sum', conditions: [] }];
    return { ...widget, config: { ...widget.config, granularity, series } };
  }
  return widget;
}

export default function WidgetConfigPanel({ widget, fields, allWidgets, onSave, onClose }: Props) {
  const { tableLabelOverrides } = useCompany();
  const [draft, setDraft] = useState<DashboardWidget>(() => normalizeWidget(widget));

  const numericFields = fields.filter(f => isNumericType(f.field_type));
  const dateFields = fields.filter(f => isDateType(f.field_type));

  const updateConfig = (patch: Record<string, any>) => {
    setDraft(prev => ({ ...prev, config: { ...prev.config, ...patch } } as DashboardWidget));
  };

  // filter_bar/quick_add_form only -- merges one field's width into
  // config.fieldLayout without disturbing any other field's override.
  const updateFieldWidth = (fieldId: string, width: FieldWidth) => {
    setDraft(prev => {
      if (prev.type !== 'filter_bar' && prev.type !== 'quick_add_form') return prev;
      return { ...prev, config: { ...prev.config, fieldLayout: { ...prev.config.fieldLayout, [fieldId]: { width } } } };
    });
  };

  // Shared by summary_tile's "only count/sum when...", grid's "only show
  // rows when...", and calendar's "only show events when..." -- same
  // TileCondition[] shape, same semantics (every condition ANDed), just
  // filtering summed/displayed/plotted rows.
  const addCondition = () => {
    if (draft.type !== 'summary_tile' && draft.type !== 'grid' && draft.type !== 'calendar') return;
    const conditions = [...(draft.config.conditions || []), { fieldId: '', operator: 'eq' as const, value: undefined }];
    updateConfig({ conditions });
  };
  const updateCondition = (index: number, patch: Partial<TileCondition>) => {
    if (draft.type !== 'summary_tile' && draft.type !== 'grid' && draft.type !== 'calendar') return;
    const conditions = (draft.config.conditions || []).map((c, i) => i === index ? { ...c, ...patch } : c);
    updateConfig({ conditions });
  };
  const removeCondition = (index: number) => {
    if (draft.type !== 'summary_tile' && draft.type !== 'grid' && draft.type !== 'calendar') return;
    updateConfig({ conditions: (draft.config.conditions || []).filter((_, i) => i !== index) });
  };

  // Per-column highlight (grid only) -- one optional condition+color per
  // field id. Toggling "off" clears the entry entirely rather than leaving
  // a disabled rule around.
  const setColumnHighlight = (fieldId: string, rule: { condition: TileCondition; color: 'red' | 'amber' | 'emerald' } | null) => {
    if (draft.type !== 'grid') return;
    const next = { ...(draft.config.columnHighlights || {}) };
    if (rule) next[fieldId] = rule; else delete next[fieldId];
    updateConfig({ columnHighlights: next });
  };

  // Chart's series live one level deeper than a tile's conditions
  // (draft.config.series[i].conditions -- addressed by a (seriesIndex,
  // conditionIndex) pair), so these are parallel functions rather than a
  // generalization of add/update/removeCondition above.
  const addSeries = () => {
    if (draft.type !== 'chart') return;
    updateConfig({ series: [...(draft.config.series || []), { label: '', valueFieldId: null, aggregate: 'sum' as const, conditions: [] }] });
  };
  const updateSeries = (index: number, patch: Partial<ChartSeriesConfig>) => {
    if (draft.type !== 'chart') return;
    updateConfig({ series: (draft.config.series || []).map((s, i) => i === index ? { ...s, ...patch } : s) });
  };
  const removeSeries = (index: number) => {
    if (draft.type !== 'chart') return;
    updateConfig({ series: (draft.config.series || []).filter((_, i) => i !== index) });
  };
  const addSeriesCondition = (seriesIndex: number) => {
    if (draft.type !== 'chart') return;
    const series = draft.config.series || [];
    updateSeries(seriesIndex, { conditions: [...(series[seriesIndex]?.conditions || []), { fieldId: '', operator: 'eq' as const, value: undefined }] });
  };
  const updateSeriesCondition = (seriesIndex: number, condIndex: number, patch: Partial<TileCondition>) => {
    if (draft.type !== 'chart') return;
    const series = draft.config.series || [];
    updateSeries(seriesIndex, { conditions: (series[seriesIndex]?.conditions || []).map((c, i) => i === condIndex ? { ...c, ...patch } : c) });
  };
  const removeSeriesCondition = (seriesIndex: number, condIndex: number) => {
    if (draft.type !== 'chart') return;
    const series = draft.config.series || [];
    updateSeries(seriesIndex, { conditions: (series[seriesIndex]?.conditions || []).filter((_, i) => i !== condIndex) });
  };
  // Axis tags -- see ChartSeriesConfig.axis's doc comment. Two tags per
  // series (e.g. Type:Billable, Metric:Hours) is the expected common case
  // (a 2x2 grid), but nothing here caps it below.
  const addSeriesAxis = (seriesIndex: number) => {
    if (draft.type !== 'chart') return;
    const series = draft.config.series || [];
    updateSeries(seriesIndex, { axis: [...(series[seriesIndex]?.axis || []), { name: '', choice: '' }] });
  };
  const updateSeriesAxis = (seriesIndex: number, axisIndex: number, patch: Partial<{ name: string; choice: string }>) => {
    if (draft.type !== 'chart') return;
    const series = draft.config.series || [];
    updateSeries(seriesIndex, { axis: (series[seriesIndex]?.axis || []).map((a, i) => i === axisIndex ? { ...a, ...patch } : a) });
  };
  const removeSeriesAxis = (seriesIndex: number, axisIndex: number) => {
    if (draft.type !== 'chart') return;
    const series = draft.config.series || [];
    updateSeries(seriesIndex, { axis: (series[seriesIndex]?.axis || []).filter((_, i) => i !== axisIndex) });
  };

  // Every summary tile on this dashboard whose aggregate a chart series can
  // actually represent -- 'net' (A minus B) has no equivalent here since
  // ChartSeriesConfig only ever plots ONE field's aggregate, not a
  // difference of two, so a net tile is left off the list entirely rather
  // than silently promoting it into a series that would plot the wrong
  // number. sum/count/count-distinct all map straight across.
  const promotableTiles = allWidgets.filter(
    (w): w is SummaryTileWidget => w.type === 'summary_tile' && w.config.aggregate !== 'net'
  );
  const addSeriesFromTile = (tile: SummaryTileWidget) => {
    if (draft.type !== 'chart') return;
    const newSeries: ChartSeriesConfig = {
      label: tile.config.label || '',
      valueFieldId: tile.config.fieldId,
      aggregate: tile.config.aggregate as ChartSeriesConfig['aggregate'],
      conditions: tile.config.conditions || [],
    };
    updateConfig({ series: [...(draft.config.series || []), newSeries] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-slate-800 capitalize">{widget.type.replace(/_/g, ' ')} settings</p>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-50"><X size={16} /></button>
        </div>

        {draft.type === 'heading' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Text</label>
              <input
                value={draft.config.text}
                onChange={e => updateConfig({ text: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Size</label>
              <select
                value={draft.config.level}
                onChange={e => updateConfig({ level: parseInt(e.target.value, 10) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value={1}>Large</option>
                <option value={2}>Medium</option>
                <option value={3}>Small</option>
              </select>
            </div>
          </div>
        )}

        {draft.type === 'text' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Text</label>
            <textarea
              value={draft.config.text}
              onChange={e => updateConfig({ text: e.target.value })}
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100 resize-none"
            />
          </div>
        )}

        {draft.type === 'filter_bar' && (
          <div className="space-y-3">
            <FieldPickerList
              title="Filter fields" fields={fields} selectedIds={draft.config.fieldIds} onChange={ids => updateConfig({ fieldIds: ids })} max={2}
              fieldWidths={Object.fromEntries(Object.entries(draft.config.fieldLayout || {}).map(([id, l]) => [id, l.width]))}
              onWidthChange={updateFieldWidth}
              showReorder={false}
            />
            <PillStyleControls pillSize={draft.config.pillSize} pillGap={draft.config.pillGap} onChange={updateConfig} />
            <p className="text-[10px] text-slate-400 px-1">
              Position is set by dragging a pill's grip handle directly on the dashboard (admin view); the dropdown next to a field here sets its width.
            </p>
          </div>
        )}

        {draft.type === 'quick_add_form' && (
          <div className="space-y-3">
            <FieldPickerList
              title="Quick-add fields" fields={fields} selectedIds={draft.config.fieldIds} onChange={ids => updateConfig({ fieldIds: ids })}
              fieldWidths={Object.fromEntries(Object.entries(draft.config.fieldLayout || {}).map(([id, l]) => [id, l.width]))}
              onWidthChange={updateFieldWidth}
              showReorder={false}
            />
            <PillStyleControls pillSize={draft.config.pillSize} pillGap={draft.config.pillGap} onChange={updateConfig} />
            <p className="text-[10px] text-slate-400 px-1">
              Position is set by dragging a pill's grip handle directly on the dashboard (admin view); the dropdown next to a field here sets its width.
            </p>
          </div>
        )}

        {draft.type === 'grid' && (
          <div className="space-y-3">
            <FieldPickerList
              title="Grid columns" fields={fields} selectedIds={draft.config.fieldIds} onChange={ids => updateConfig({ fieldIds: ids })}
              fieldWidths={Object.fromEntries(Object.entries(draft.config.columnWidths || {}).map(([id, px]) => [id, widthCategoryFromPx(px)]))}
              onWidthChange={(fieldId, width) => updateConfig({ columnWidths: { ...(draft.config.columnWidths || {}), [fieldId]: GRID_WIDTH_PX[width] } })}
            />
            <p className="text-[10px] text-slate-400 px-1">
              Reorder with the arrows to change each column's position; the same width control is also live-draggable on the dashboard itself (drag a column's right edge).
            </p>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Extra empty rows
              </label>
              <input
                type="number"
                min={0}
                max={20}
                value={draft.config.emptyRowCount || 0}
                onChange={e => updateConfig({ emptyRowCount: Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
              />
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                Blank rows kept at the bottom for fast entry -- typing into one creates a new record
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!draft.config.showTotalsRow}
                onChange={e => updateConfig({ showTotalsRow: e.target.checked })}
                className="rounded"
              />
              <span className="text-[11px] font-medium text-slate-600">Show a totals row</span>
            </label>

            {draft.config.showTotalsRow && (() => {
              const totalsEligible = draft.config.fieldIds
                .map(id => fields.find(f => f.id === id))
                .filter((f): f is NonNullable<typeof f> => !!f && (f.field_type === 'number' || f.field_type === 'currency' || f.field_type === 'boolean'));
              if (!totalsEligible.length) return null;
              // Undefined totalsColumns == today's default (every number/
              // currency column, no boolean) -- materialized into an
              // explicit array the moment any checkbox here is touched.
              const defaultIds = totalsEligible.filter(f => f.field_type !== 'boolean').map(f => f.id);
              const activeIds = draft.config.totalsColumns ?? defaultIds;
              return (
                <div className="pl-1 space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                    Columns to total
                  </label>
                  {totalsEligible.map(f => (
                    <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeIds.includes(f.id)}
                        onChange={e => {
                          const next = e.target.checked ? [...activeIds, f.id] : activeIds.filter(id => id !== f.id);
                          updateConfig({ totalsColumns: next });
                        }}
                        className="rounded"
                      />
                      <span className="text-[11px] font-medium text-slate-600">
                        {f.label}{f.field_type === 'boolean' ? ' (count checked)' : ''}
                      </span>
                    </label>
                  ))}
                </div>
              );
            })()}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Only show rows when... (all must match)
                </label>
                <button
                  onClick={addCondition}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  <Plus size={11} /> Add condition
                </button>
              </div>
              {(draft.config.conditions || []).map((cond, i) => (
                <ConditionRow
                  key={i}
                  condition={cond}
                  fields={fields}
                  onChange={patch => updateCondition(i, patch)}
                  onRemove={() => removeCondition(i)}
                />
              ))}
              {(!draft.config.conditions || draft.config.conditions.length === 0) && (
                <p className="text-[11px] text-slate-300 italic py-1">No conditions. Shows every record (still narrowed by the filter bar, if any)</p>
              )}
            </div>

            {draft.config.fieldIds.length > 0 && (
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                  Column highlights
                </label>
                <div className="space-y-2">
                  {draft.config.fieldIds.map(fieldId => {
                    const field = fields.find(f => f.id === fieldId);
                    if (!field) return null;
                    const rule = draft.config.columnHighlights?.[fieldId];
                    return (
                      <div key={fieldId} className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-600 px-1">{field.label}</span>
                          {!rule ? (
                            <button
                              onClick={() => setColumnHighlight(fieldId, { condition: { fieldId: '', operator: 'eq', value: undefined }, color: 'red' })}
                              className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 shrink-0"
                            >
                              <Plus size={11} /> Add highlight
                            </button>
                          ) : (
                            <button onClick={() => setColumnHighlight(fieldId, null)} className="p-1 text-slate-300 hover:text-red-500 shrink-0">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        {rule && (
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 min-w-0">
                              <ConditionRow
                                condition={rule.condition}
                                fields={fields}
                                onChange={patch => setColumnHighlight(fieldId, { ...rule, condition: { ...rule.condition, ...patch } })}
                                onRemove={() => setColumnHighlight(fieldId, null)}
                              />
                            </div>
                            <select
                              value={rule.color}
                              onChange={e => setColumnHighlight(fieldId, { ...rule, color: e.target.value as 'red' | 'amber' | 'emerald' })}
                              className="shrink-0 bg-white border border-slate-200 rounded-full py-2 px-2.5 text-[12px] font-medium outline-none appearance-none"
                            >
                              <option value="red">Red</option>
                              <option value="amber">Amber</option>
                              <option value="emerald">Green</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 px-1">
                  Highlights a cell's background when its row matches the condition -- the condition can reference any field, not just this column (e.g. highlight Amount when Status is Overdue)
                </p>
              </div>
            )}
          </div>
        )}

        {draft.type === 'summary_tile' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Label</label>
              <input
                value={draft.config.label}
                onChange={e => updateConfig({ label: e.target.value })}
                placeholder="e.g. Time Logged"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={draft.config.fieldId || ''}
                onChange={e => {
                  const nextField = fields.find(f => f.id === e.target.value);
                  const nextAggregates = aggregatesForType(nextField?.field_type || 'text');
                  const stillValid = nextAggregates.some(a => a.value === draft.config.aggregate);
                  updateConfig({
                    fieldId: e.target.value || null,
                    aggregate: stillValid ? draft.config.aggregate : nextAggregates[0].value,
                  });
                }}
                className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">Field...</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select
                value={draft.config.aggregate}
                onChange={e => updateConfig({ aggregate: e.target.value as SummaryTileWidget['config']['aggregate'] })}
                className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                {aggregatesForType(fields.find(f => f.id === draft.config.fieldId)?.field_type || 'text').map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            {draft.config.aggregate === 'net' && (
              <select
                value={draft.config.fieldBId || ''}
                onChange={e => updateConfig({ fieldBId: e.target.value || null })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">Minus field... (e.g. Amount Out)</option>
                {numericFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Only count/sum when... (all must match)
                </label>
                <button
                  onClick={addCondition}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  <Plus size={11} /> Add condition
                </button>
              </div>
              {(draft.config.conditions || []).map((cond, i) => (
                <ConditionRow
                  key={i}
                  condition={cond}
                  fields={fields}
                  onChange={patch => updateCondition(i, patch)}
                  onRemove={() => removeCondition(i)}
                />
              ))}
              {(!draft.config.conditions || draft.config.conditions.length === 0) && (
                <p className="text-[11px] text-slate-300 italic py-1">No conditions. Counts/sums every record</p>
              )}
            </div>
          </div>
        )}

        {draft.type === 'chart' && (
          <div className="space-y-3">
            <select
              value={draft.config.dateFieldId}
              onChange={e => updateConfig({ dateFieldId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
            >
              <option value="">Date field...</option>
              {dateFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>

            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Group by</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['day', 'week', 'month'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => updateConfig({ granularity: g })}
                    className={`py-2 rounded-full text-[11px] font-bold capitalize transition-all ${
                      (draft.config.granularity || 'day') === g ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Chart type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['bar', 'line', 'area'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => updateConfig({ chartType: t })}
                    className={`py-2 rounded-full text-[11px] font-bold capitalize transition-all ${
                      (draft.config.chartType || 'bar') === t ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Series</label>
                {(draft.config.series?.length || 0) < 8 && (
                  <button onClick={addSeries} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                    <Plus size={11} /> Add series
                  </button>
                )}
              </div>
              {promotableTiles.length > 0 && (draft.config.series?.length || 0) < 8 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Or add from an existing tile</p>
                  <div className="flex flex-wrap gap-1.5">
                    {promotableTiles.map(tile => (
                      <button
                        key={tile.id}
                        onClick={() => addSeriesFromTile(tile)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                      >
                        <Plus size={10} /> {tile.config.label || 'Untitled tile'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(draft.config.series || []).map((s, si) => (
                <div key={si} className="p-3 bg-slate-50/60 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={s.label}
                      onChange={e => updateSeries(si, { label: e.target.value })}
                      placeholder="Series label (e.g. Billable Hours)"
                      className="flex-1 bg-white border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none"
                    />
                    <button onClick={() => removeSeries(si)} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500"><X size={13} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={s.aggregate}
                      onChange={e => updateSeries(si, { aggregate: e.target.value as ChartSeriesConfig['aggregate'] })}
                      className="bg-white border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none appearance-none"
                    >
                      <option value="sum">Sum a field</option>
                      <option value="count">Count entries</option>
                      <option value="count-distinct">Count distinct values</option>
                    </select>
                    {(s.aggregate === 'sum' || s.aggregate === 'count-distinct') && (
                      <select
                        value={s.valueFieldId || ''}
                        onChange={e => updateSeries(si, { valueFieldId: e.target.value || null })}
                        className="bg-white border border-slate-200 rounded-full py-2 px-3 text-[12px] font-medium outline-none appearance-none"
                      >
                        <option value="">Value field...</option>
                        {(s.aggregate === 'sum' ? numericFields : fields).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Only when... (all must match)</label>
                      <button onClick={() => addSeriesCondition(si)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                        <Plus size={11} /> Add condition
                      </button>
                    </div>
                    {(s.conditions || []).map((cond, ci) => (
                      <ConditionRow
                        key={ci}
                        condition={cond}
                        fields={fields}
                        onChange={patch => updateSeriesCondition(si, ci, patch)}
                        onRemove={() => removeSeriesCondition(si, ci)}
                      />
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        Axis tags (groups this into a toggle -- e.g. Type: Billable)
                      </label>
                      <button onClick={() => addSeriesAxis(si)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                        <Plus size={11} /> Add tag
                      </button>
                    </div>
                    {(s.axis || []).map((tag, ai) => (
                      <div key={ai} className="flex items-center gap-1.5">
                        <input
                          value={tag.name}
                          onChange={e => updateSeriesAxis(si, ai, { name: e.target.value })}
                          placeholder="Axis (e.g. Type)"
                          className="flex-1 bg-white border border-slate-200 rounded-full py-1.5 px-3 text-[11px] font-medium outline-none"
                        />
                        <input
                          value={tag.choice}
                          onChange={e => updateSeriesAxis(si, ai, { choice: e.target.value })}
                          placeholder="Choice (e.g. Billable)"
                          className="flex-1 bg-white border border-slate-200 rounded-full py-1.5 px-3 text-[11px] font-medium outline-none"
                        />
                        <button onClick={() => removeSeriesAxis(si, ai)} className="shrink-0 p-1 text-slate-300 hover:text-red-500"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!draft.config.series || draft.config.series.length === 0) && (
                <p className="text-[11px] text-slate-300 italic py-1">No series yet. Add one to plot a measure</p>
              )}
            </div>

            <p className="text-[10px] text-slate-400 px-1">
              Tip: plot multiple series of the SAME unit on one chart (e.g. billable vs non-billable hours). For different units, use separate chart widgets.
            </p>
          </div>
        )}

        {draft.type === 'calendar' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Label</label>
              <input
                value={draft.config.label}
                onChange={e => updateConfig({ label: e.target.value })}
                placeholder="e.g. Due Dates"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <select
              value={draft.config.dateFieldId || ''}
              onChange={e => updateConfig({ dateFieldId: e.target.value || null })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
            >
              <option value="">Date field...</option>
              {dateFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Only show when... (all must match)
                </label>
                <button
                  onClick={addCondition}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  <Plus size={11} /> Add condition
                </button>
              </div>
              {(draft.config.conditions || []).map((cond, i) => (
                <ConditionRow
                  key={i}
                  condition={cond}
                  fields={fields}
                  onChange={patch => updateCondition(i, patch)}
                  onRemove={() => removeCondition(i)}
                />
              ))}
              {(!draft.config.conditions || draft.config.conditions.length === 0) && (
                <p className="text-[11px] text-slate-300 italic py-1">No conditions. Shows every record with a date</p>
              )}
            </div>
          </div>
        )}

        {(draft.type === 'trust_reconciliation' || draft.type === 'ledes_export'
          || draft.type === 'trust_ledger_statement' || draft.type === 'trust_cash_book') && (
          <p className="text-[11px] text-slate-400 italic">No settings. It always reads this dashboard's own table.</p>
        )}

        {draft.type === 'document_export' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Style</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['letter', 'invoice'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => updateConfig({ style: s })}
                    className={`py-2 rounded-full text-[11px] font-bold capitalize transition-all ${
                      draft.config.style === s ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {draft.config.style === 'letter' ? (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-400 px-1">Renders onto the company's letterhead (Settings → Precedents).</p>
                {([
                  ['bodyFieldId', 'Body text field (required)'],
                  ['recipientNameFieldId', 'Recipient name field'],
                  ['recipientAddressFieldId', 'Recipient address field'],
                  ['subjectFieldId', 'Subject field'],
                ] as const).map(([key, placeholder]) => (
                  <select
                    key={key}
                    value={draft.config.letter?.[key] || ''}
                    onChange={e => setDraft(prev => ({ ...prev, config: { ...(prev as any).config, letter: { ...(prev as any).config.letter, [key]: e.target.value || null } } } as DashboardWidget))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">{placeholder}...</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-400 px-1">One line item per record, from its own description/amount fields.</p>
                {([
                  ['invoiceNumberFieldId', 'Invoice number field'],
                  ['invoiceDateFieldId', 'Invoice date field'],
                  ['dueDateFieldId', 'Due date field'],
                  ['customerNameFieldId', 'Customer name field'],
                  ['customerAddressFieldId', 'Customer address field'],
                  ['descriptionFieldId', 'Line item description field'],
                  ['amountFieldId', 'Line item amount field'],
                  ['subtotalFieldId', 'Subtotal field'],
                  ['taxFieldId', 'Tax field'],
                  ['totalFieldId', 'Total field'],
                ] as const).map(([key, placeholder]) => (
                  <select
                    key={key}
                    value={draft.config.invoice?.[key] || ''}
                    onChange={e => setDraft(prev => ({ ...prev, config: { ...(prev as any).config, invoice: { ...(prev as any).config.invoice, [key]: e.target.value || null } } } as DashboardWidget))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">{placeholder}...</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                ))}

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Tax terminology</label>
                  <select
                    value={draft.config.invoice?.taxScheme || ''}
                    onChange={e => setDraft(prev => ({ ...prev, config: { ...(prev as any).config, invoice: { ...(prev as any).config.invoice, taxScheme: e.target.value || null } } } as DashboardWidget))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">Tax (generic)...</option>
                    {TAX_SCHEMES.map(s => <option key={s.value} value={s.value}>{s.region} -- {s.taxLabel}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-400 px-1 mt-1">Only changes the printed label (e.g. "GST"); the amount still comes from the Tax field above.</p>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Payment details</label>
                  <textarea
                    value={draft.config.invoice?.paymentDetails || ''}
                    onChange={e => setDraft(prev => ({ ...prev, config: { ...(prev as any).config, invoice: { ...(prev as any).config.invoice, paymentDetails: e.target.value || null } } } as DashboardWidget))}
                    placeholder={'Bank: ...\nBSB / Routing: ...\nAccount: ...'}
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none resize-none"
                  />
                  <p className="text-[10px] text-slate-400 px-1 mt-1">Printed below the totals on every export from this widget.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {draft.type === 'invoice_import' && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-400 px-1">Each imported PDF line item becomes its own row on this table.</p>
            {([
              ['descriptionFieldId', 'Description field (required)'],
              ['amountFieldId', 'Amount field (required)'],
              ['supplierNameFieldId', 'Supplier name field'],
              ['invoiceNumberFieldId', 'Invoice number field'],
              ['invoiceDateFieldId', 'Invoice date field'],
            ] as const).map(([key, placeholder]) => (
              <select
                key={key}
                value={(draft.config as any)[key] || ''}
                onChange={e => updateConfig({ [key]: e.target.value || null })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">{placeholder}...</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            ))}
          </div>
        )}

        {draft.type === 'public_task_page' && (
          <PublicTaskPageConfig
            pageId={draft.config.pageId}
            onPageIdChange={pageId => updateConfig({ pageId: pageId || null })}
          />
        )}

        {draft.type === 'public_document_page' && (
          <PublicDocumentPageConfig
            pageId={draft.config.pageId}
            onPageIdChange={pageId => updateConfig({ pageId: pageId || null })}
          />
        )}

        {draft.type === 'public_client_update_page' && (
          <PublicClientUpdatePageConfig
            slug={draft.config.slug}
            onSlugChange={slug => updateConfig({ slug: slug || null })}
          />
        )}

        {draft.type === 'my_tasks_button' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Button label</label>
              <input
                value={draft.config.label ?? ''}
                onChange={e => updateConfig({ label: e.target.value })}
                placeholder="My Tasks"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Description field</label>
              <select
                value={draft.config.descriptionFieldId ?? ''}
                onChange={e => updateConfig({ descriptionFieldId: e.target.value || null })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">None -- required before Convert works</option>
                {fields.filter(f => !f.formula_type).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                A task's (optionally AI-rewritten) text is loaded into this field on the quick-add form.
              </p>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                {tableLabelOverrides.projects?.singular || 'Matter'} field (optional)
              </label>
              <select
                value={draft.config.matterFieldId ?? ''}
                onChange={e => updateConfig({ matterFieldId: e.target.value || null })}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">None</option>
                {fields.filter(f => isRelationType(f.field_type) && f.linked_system_table === 'projects').map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                When a task is linked to a {(tableLabelOverrides.projects?.singular || 'Matter').toLowerCase()}, it's also loaded into this field.
              </p>
            </div>
          </div>
        )}

        {draft.type === 'trust_aged_balances' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Flag dormant after (days)</label>
            <input
              type="number"
              min={1}
              value={draft.config.dormantDays}
              onChange={e => updateConfig({ dormantDays: Math.max(1, parseInt(e.target.value, 10) || 365) })}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={() => onSave(draft)} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all">Done</button>
        </div>
      </div>
    </div>
  );
}
