"use client";

import { useState, useEffect } from "react";
import {
  MapPin, Building2, Plus, LogOut, LayoutGrid,
  Settings, Shield, ChevronsUpDown, Loader2, Mail,
  Table2, Eye, EyeOff, X, Check
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import NewProjectModal from "./NewProjectModal";
import NewEntityModal from "./NewEntityModal";
import { useCustomTables } from "@/lib/hooks/useCustomTables";

// ── System table definitions ───────────────────────────────────────

const ALL_SYSTEM_TABLES = [
  { slug: 'projects',   label: 'Projects',   icon: LayoutGrid },
  { slug: 'properties', label: 'Properties', icon: MapPin },
  { slug: 'entities',   label: 'Entities',   icon: Building2 },
];

const STORAGE_KEY = 'sidebar_visible_tables';

// ── Table visibility panel ─────────────────────────────────────────

function TableVisibilityPanel({
  visible,
  systemTables,
  customTables,
  onChange,
  onClose,
}: {
  visible: string[];
  systemTables: typeof ALL_SYSTEM_TABLES;
  customTables: { id: string; slug: string; name: string; icon: string }[];
  onChange: (slugs: string[]) => void;
  onClose: () => void;
}) {
  const toggle = (slug: string) => {
    const next = visible.includes(slug)
      ? visible.filter(s => s !== slug)
      : [...visible, slug];
    if (next.length === 0) return;
    onChange(next);
  };

  const Row = ({
    slug,
    label,
    icon: Icon,
  }: {
    slug: string;
    label: string;
    icon: React.ElementType;
  }) => {
    const isVisible = visible.includes(slug);
    return (
      <button
        onClick={() => toggle(slug)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left ${
          isVisible ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'
        }`}
      >
        <Icon size={14} />
        <span className="text-[12px] font-bold flex-1">{label}</span>
        {isVisible
          ? <Check size={12} className="shrink-0" />
          : <EyeOff size={12} className="shrink-0 opacity-40" />
        }
      </button>
    );
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-3xl border border-slate-200 shadow-xl z-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          Visible tables
        </p>
        <button
          onClick={onClose}
          className="p-1 text-slate-300 hover:text-slate-600 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* System */}
      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest px-1 mb-1.5">
        System
      </p>
      <div className="space-y-1 mb-3">
        {systemTables.map(t => (
          <Row key={t.slug} slug={t.slug} label={t.label} icon={t.icon} />
        ))}
      </div>

      {/* Custom */}
      {customTables.length > 0 && (
        <>
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest px-1 mb-1.5">
            Custom
          </p>
          <div className="space-y-1">
            {customTables.map(t => {
              const Icon = (LucideIcons as any)[t.icon] || Table2;
              return (
                <Row key={t.slug} slug={t.slug} label={t.name} icon={Icon} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main sidebar ───────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentId = searchParams.get("id");

  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [isProjOpen, setIsProjOpen] = useState(false);
  const [isEntOpen, setIsEntOpen] = useState(false);
  const [visibleTables, setVisibleTables] = useState<string[]>([]);
  const [showTableSettings, setShowTableSettings] = useState(false);
  const { tables: customTables } = useCustomTables();

  const mode = pathname.includes("projects") ? "projects"
    : pathname.includes("properties") ? "properties"
    : "entities";

  // Load visibility preference once custom tables are known
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setVisibleTables(JSON.parse(saved));
      } else {
        // Default: all visible
        setVisibleTables([
          ...ALL_SYSTEM_TABLES.map(t => t.slug),
          ...customTables.map(t => t.slug),
        ]);
      }
    } catch {
      setVisibleTables(ALL_SYSTEM_TABLES.map(t => t.slug));
    }
  }, [customTables]);

  useEffect(() => {
    fetchTreeData();
    fetchProfile();
  }, [mode]);

  // Close company switcher on outside click
  useEffect(() => {
    if (!showCompanySwitcher) return;
    const handleClick = () => setShowCompanySwitcher(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showCompanySwitcher]);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*, company:active_company_id(id, name, status)")
      .eq("id", user.id)
      .single();
    setProfile(data);
    setIsAdmin(data?.is_admin || false);
    const { data: ms } = await supabase
      .from("company_memberships")
      .select("company_id, role, company:company_id(id, name, status)")
      .eq("user_id", user.id);
    setMemberships(ms || []);
  };

  const fetchTreeData = async () => {
    const nameCol = mode === 'properties' ? 'street_address' : 'name';
    const { data } = await supabase
      .from(mode)
      .select(`id, ${nameCol}`)
      .is('deleted_at', null)
      .limit(50);
    setItems(data || []);
  };

  const handleSwitchCompany = async (companyId: string) => {
    if (companyId === profile?.active_company_id) return;
    setSwitchingCompany(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSwitchingCompany(false); return; }
    await supabase.from('profiles')
      .update({ active_company_id: companyId })
      .eq('id', user.id);
    const { invalidateSchemaCache, clearCompanyIdCache } =
      await import('@/lib/services/schemaService');
    invalidateSchemaCache();
    clearCompanyIdCache();
    setSwitchingCompany(false);
    setShowCompanySwitcher(false);
    window.location.replace('/dashboard/properties');
  };

  const handleVisibilityChange = (slugs: string[]) => {
    setVisibleTables(slugs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  };

  const visibleSystemTables = ALL_SYSTEM_TABLES.filter(t =>
    visibleTables.includes(t.slug)
  );
  const visibleCustomTables = customTables.filter(t =>
    visibleTables.includes(t.slug)
  );

  const isTableActive = (slug: string) =>
    pathname.includes(slug) &&
    !pathname.includes('gmail') &&
    !pathname.includes('settings') &&
    !pathname.includes('admin');

  return (
    <div className="flex flex-col h-screen bg-white border-r border-slate-100 font-sans select-none antialiased text-slate-600 overflow-hidden">

      {/* ── Logo ── */}
      <div className="px-6 py-6 flex items-center gap-3 border-b border-slate-100">
        <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm shrink-0">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-white" />
        </div>
        <span className="font-bold text-[15px] tracking-tighter text-slate-900 uppercase">
          niksen
        </span>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">

        {/* Tables section */}
        <div className="mb-2">
          <div className="flex items-center justify-between px-3 mb-1">
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
              Tables
            </p>
            <button
              onClick={() => setShowTableSettings(p => !p)}
              className="p-1 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
              title="Configure visible tables"
            >
              <Eye size={12} />
            </button>
          </div>

          {/* Visible system tables */}
          {visibleSystemTables.map(({ slug, label, icon: Icon }) => (
            <button
              key={slug}
              onClick={() => router.push(`/dashboard/${slug}`)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-all ${
                isTableActive(slug)
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}

          {/* Visible custom tables */}
          {visibleCustomTables.map(table => {
            const Icon = (LucideIcons as any)[table.icon] || Table2;
            return (
              <button
                key={table.id}
                onClick={() => router.push(`/dashboard/${table.slug}`)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-all ${
                  isTableActive(table.slug)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{table.name}</span>
              </button>
            );
          })}

          {/* Empty state */}
          {visibleSystemTables.length === 0 && visibleCustomTables.length === 0 && (
            <button
              onClick={() => setShowTableSettings(true)}
              className="w-full px-3 py-2.5 text-[11px] text-slate-300 italic text-left"
            >
              No tables visible — click eye to configure
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 my-2 mx-3" />

        {/* Gmail */}
        <Link
          href="/dashboard/gmail"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-all ${
            pathname.includes('/gmail')
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Mail size={16} className="shrink-0" />
          Gmail
        </Link>

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-all ${
            pathname.includes('/settings')
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Settings size={16} className="shrink-0" />
          Settings
        </Link>

        {/* Admin */}
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium transition-all ${
              pathname.includes('/admin')
                ? 'bg-amber-600 text-white'
                : 'text-amber-600 hover:bg-amber-50'
            }`}
          >
            <Shield size={16} className="shrink-0" />
            Admin
          </Link>
        )}

        {/* Divider */}
        <div className="h-px bg-slate-100 my-2 mx-3" />

        {/* Tree nav */}
        <div>
          <div className="flex items-center justify-between px-3 mb-1">
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
              {mode}
            </p>
            <button
              onClick={() => mode === 'entities'
                ? setIsEntOpen(true)
                : setIsProjOpen(true)
              }
              className="p-1 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
            >
              <Plus size={12} strokeWidth={3} />
            </button>
          </div>

          {items.map(item => (
            <Link
              key={item.id}
              href={`/dashboard/${mode}?id=${item.id}`}
              className={`flex items-center px-3 py-2 rounded-2xl text-[12px] transition-all ${
                currentId === item.id
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-medium'
              }`}
            >
              <span className="truncate">{item.name || item.street_address}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Footer ── */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-1">

        {/* Profile / company switcher */}
        <div className="relative" onClick={e => e.stopPropagation()}>

          {/* Table visibility panel — floats above */}
          {showTableSettings && (
            <TableVisibilityPanel
              visible={visibleTables}
              systemTables={ALL_SYSTEM_TABLES}
              customTables={customTables}
              onChange={handleVisibilityChange}
              onClose={() => setShowTableSettings(false)}
            />
          )}

          <button
            onClick={() => setShowCompanySwitcher(p => !p)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 transition-all text-left"
          >
            <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0">
              {profile?.full_name?.substring(0, 2) || 'AD'}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-[12px] font-bold text-slate-900 truncate">
                {profile?.company?.name || 'No company'}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {profile?.full_name || 'User'}
              </p>
            </div>
            {memberships.length > 1 && (
              <ChevronsUpDown size={14} className="text-slate-300 shrink-0" />
            )}
          </button>

          {/* Company switcher dropdown */}
          {showCompanySwitcher && memberships.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden z-50">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-5 pt-4 pb-2">
                {memberships.length > 1 ? 'Switch company' : 'Your company'}
              </p>

              {memberships.map(m => {
                const isActive = m.company_id === profile?.active_company_id;
                return (
                  <button
                    key={m.company_id}
                    onClick={() => handleSwitchCompany(m.company_id)}
                    disabled={isActive || switchingCompany}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors disabled:cursor-default ${
                      isActive ? 'bg-slate-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {m.company?.name?.substring(0, 2)?.toUpperCase() || '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-bold truncate ${
                        isActive ? 'text-slate-900' : 'text-slate-600'
                      }`}>
                        {m.company?.name || 'Unknown'}
                      </p>
                      <p className="text-[9px] text-slate-400 uppercase font-medium">
                        {m.role?.replace('_', ' ')}
                        {m.company?.status === 'pending' && (
                          <span className="ml-1.5 text-amber-500">· pending</span>
                        )}
                      </p>
                    </div>
                    {isActive && (
                      <div className="h-2 w-2 rounded-full bg-slate-900 shrink-0" />
                    )}
                    {!isActive && switchingCompany && (
                      <Loader2 size={12} className="animate-spin text-slate-300 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={() => supabase.auth.signOut().then(
            () => window.location.replace("/login")
          )}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[12px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
        >
          <LogOut size={15} className="shrink-0" />
          Sign out
        </button>
      </div>

      <NewProjectModal
        isOpen={isProjOpen}
        onClose={() => setIsProjOpen(false)}
        onRefresh={fetchTreeData}
      />
      <NewEntityModal
        isOpen={isEntOpen}
        onClose={() => setIsEntOpen(false)}
        onRefresh={fetchTreeData}
      />
    </div>
  );
}