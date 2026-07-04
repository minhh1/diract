"use client";

import { useState, useEffect } from "react";
import {
  MapPin, Building2, Plus, LogOut, LayoutGrid,
  SortAsc, Settings, Shield, ChevronsUpDown, Loader2
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import NewProjectModal from "./NewProjectModal";
import NewEntityModal from "./NewEntityModal";

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

  const mode = pathname.includes("projects") ? "projects"
    : pathname.includes("properties") ? "properties"
    : "entities";

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

    // Fetch all companies this user belongs to for the switcher
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

    await supabase
      .from('profiles')
      .update({ active_company_id: companyId })
      .eq('id', user.id);

    // Clear caches so new company's data and schema load fresh
    const { invalidateSchemaCache, clearCompanyIdCache } = await import('@/lib/services/schemaService');
    invalidateSchemaCache();
    clearCompanyIdCache();

    setSwitchingCompany(false);
    setShowCompanySwitcher(false);
    window.location.replace('/dashboard/properties');
  };

  const handleSignOut = () => {
    supabase.auth.signOut().then(() => window.location.replace("/login"));
  };

  return (
    <div className="flex flex-col h-screen bg-white border-r border-slate-200 font-sans select-none antialiased text-slate-600">

      {/* Logo */}
      <div className="p-8 mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-black flex items-center justify-center shadow-xl">
          <div className="h-4 w-4 rounded-full border-[2px] border-white" />
        </div>
        <span className="font-bold text-xl tracking-tighter text-slate-900 uppercase">niksen-flow</span>
      </div>

      {/* Mode switcher */}
      <div className="px-6 mb-8">
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => router.push('/dashboard/projects')}
            className={`flex-1 flex justify-center py-2.5 rounded-xl transition-all ${mode === 'projects' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => router.push('/dashboard/properties')}
            className={`flex-1 flex justify-center py-2.5 rounded-xl transition-all ${mode === 'properties' ? 'bg-white text-black shadow-sm' : 'text-slate-400'}`}
          >
            <MapPin size={18} />
          </button>
          <button
            onClick={() => router.push('/dashboard/entities')}
            className={`flex-1 flex justify-center py-2.5 rounded-xl transition-all ${mode === 'entities' ? 'bg-white text-black shadow-sm' : 'text-slate-400'}`}
          >
            <Building2 size={18} />
          </button>
        </div>
      </div>

      {/* Tree nav */}
      <nav className="flex-1 overflow-y-auto px-4 space-y-1 custom-scrollbar">
        <div className="flex items-center justify-between px-4 mb-4 group/header">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {mode} tree
          </p>
          <div className="flex gap-2 opacity-0 group-hover/header:opacity-100 transition-opacity">
            <button
              onClick={() => mode === 'entities' ? setIsEntOpen(true) : setIsProjOpen(true)}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-black"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
            <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-black">
              <SortAsc size={14} />
            </button>
          </div>
        </div>

        {items.map(item => (
          <Link
            key={item.id}
            href={`/dashboard/${mode}?id=${item.id}`}
            className={`flex items-center gap-4 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all ${
              currentId === item.id
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-slate-500 hover:bg-slate-50 hover:text-black'
            }`}
          >
            <span className="truncate">{item.name || item.street_address}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-6 border-t mt-auto space-y-3">

        {/* Admin panel — only visible to platform admins */}
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className="flex items-center gap-3 p-3 rounded-3xl bg-amber-50 border border-amber-100 hover:border-amber-300 transition-all group"
          >
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Shield size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-[13px] font-bold text-amber-700">Admin panel</p>
              <p className="text-[10px] font-medium text-amber-500 uppercase tracking-tighter">
                Platform management
              </p>
            </div>
          </Link>
        )}

        {/* Company switcher / profile card */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowCompanySwitcher(p => !p)}
            className="w-full flex items-center gap-3 p-3 rounded-3xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all group"
          >
            <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0">
              {profile?.full_name?.substring(0, 2) || 'AD'}
            </div>
            <div className="flex flex-col min-w-0 flex-1 text-left">
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {profile?.full_name || 'Admin User'}
              </p>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter truncate">
                {profile?.company?.name || 'No company'}
                {memberships.length > 1 && ` · ${memberships.length} companies`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {memberships.length > 1 && (
                <ChevronsUpDown
                  size={14}
                  className="text-slate-300 group-hover:text-indigo-600 transition-colors"
                />
              )}
              <Settings
                size={14}
                className="text-slate-300 group-hover:text-indigo-600 transition-colors"
                onClick={(e) => { e.stopPropagation(); router.push('/dashboard/settings'); }}
              />
            </div>
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
                    className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors disabled:cursor-default ${
                      isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {m.company?.name?.substring(0, 2)?.toUpperCase() || '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-bold truncate ${isActive ? 'text-indigo-600' : 'text-slate-700'}`}>
                        {m.company?.name || 'Unknown'}
                      </p>
                      <p className="text-[9px] text-slate-400 uppercase font-medium tracking-wide">
                        {m.role?.replace('_', ' ')}
                        {m.company?.status === 'pending' && (
                          <span className="ml-1.5 text-amber-500">· pending</span>
                        )}
                      </p>
                    </div>
                    {isActive && (
                      <div className="h-2 w-2 rounded-full bg-indigo-600 shrink-0" />
                    )}
                    {!isActive && switchingCompany && (
                      <Loader2 size={12} className="animate-spin text-slate-300 shrink-0" />
                    )}
                  </button>
                );
              })}

              {/* Settings link inside switcher */}
              <div className="border-t border-slate-100 mt-1">
                <button
                  onClick={() => { setShowCompanySwitcher(false); router.push('/dashboard/settings'); }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <Settings size={13} className="text-slate-400" />
                  </div>
                  <p className="text-[12px] font-bold text-slate-600">Workspace settings</p>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-4 w-full px-4 py-3 text-sm font-bold text-slate-400 hover:text-red-600 transition-all uppercase tracking-widest"
        >
          <LogOut size={20} /> Sign Out
        </button>
      </div>

      <NewProjectModal isOpen={isProjOpen} onClose={() => setIsProjOpen(false)} onRefresh={fetchTreeData} />
      <NewEntityModal isOpen={isEntOpen} onClose={() => setIsEntOpen(false)} onRefresh={fetchTreeData} />
    </div>
  );
}