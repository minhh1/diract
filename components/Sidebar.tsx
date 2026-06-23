"use client";

import { useState, useEffect } from "react";
import { CheckSquare, Folder, MapPin, Building2, Plus, LogOut, LayoutGrid, SortAsc, User, Settings } from "lucide-react";
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

  const mode = pathname.includes("projects") ? "projects" 
             : pathname.includes("properties") ? "properties" 
             : "entities";

  const [items, setItems] = useState<any[]>([]);
  const [isProjOpen, setIsProjOpen] = useState(false);
  const [isEntOpen, setIsEntOpen] = useState(false);

  useEffect(() => {
    fetchTreeData();
    fetchProfile();
  }, [mode]);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
    }
  };

  const fetchTreeData = async () => {
    const nameCol = mode === 'properties' ? 'street_address' : 'name';
    const { data } = await supabase.from(mode).select(`id, ${nameCol}`).is('deleted_at', null).limit(50);
    setItems(data || []);
  };

  return (
    <div className="flex flex-col h-screen bg-white border-r border-slate-200 font-sans select-none antialiased text-slate-600">
      <div className="p-8 mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-black flex items-center justify-center shadow-xl">
          <div className="h-4 w-4 rounded-full border-[2px] border-white" />
        </div>
        <span className="font-bold text-xl tracking-tighter text-slate-900 uppercase">niksen-flow</span>
      </div>

      <div className="px-6 mb-8">
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button onClick={() => router.push('/dashboard/projects')} className={`flex-1 flex justify-center py-2.5 rounded-xl transition-all ${mode === 'projects' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={18}/></button>
          <button onClick={() => router.push('/dashboard/properties')} className={`flex-1 flex justify-center py-2.5 rounded-xl transition-all ${mode === 'properties' ? 'bg-white text-black shadow-sm' : 'text-slate-400'}`}><MapPin size={18}/></button>
          <button onClick={() => router.push('/dashboard/entities')} className={`flex-1 flex justify-center py-2.5 rounded-xl transition-all ${mode === 'entities' ? 'bg-white text-black shadow-sm' : 'text-slate-400'}`}><Building2 size={18}/></button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 space-y-1 custom-scrollbar">
        <div className="flex items-center justify-between px-4 mb-4 group/header">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{mode} tree</p>
          <div className="flex gap-2 opacity-0 group-hover/header:opacity-100 transition-opacity">
            <button onClick={() => mode === 'entities' ? setIsEntOpen(true) : setIsProjOpen(true)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-black"><Plus size={14} strokeWidth={3}/></button>
            <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-black"><SortAsc size={14}/></button>
          </div>
        </div>
        {items.map((item) => (
          <Link key={item.id} href={`/dashboard/${mode}?id=${item.id}`} className={`flex items-center gap-4 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all ${currentId === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 hover:text-black'}`}>
            <span className="truncate">{item.name || item.street_address}</span>
          </Link>
        ))}
      </nav>

      {/* FOOTER: PROFILE & SIGN OUT */}
      <div className="p-6 border-t mt-auto space-y-3">
        <Link href="/dashboard/settings" className="flex items-center gap-3 p-3 rounded-3xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all group">
          <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">{profile?.full_name?.substring(0,2) || 'AD'}</div>
          <div className="flex flex-col min-w-0">
            <p className="text-[13px] font-bold text-slate-900 truncate">{profile?.full_name || 'Admin User'}</p>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">Workspace Settings</p>
          </div>
        </Link>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.replace("/login"))} className="flex items-center gap-4 w-full px-4 py-3 text-sm font-bold text-slate-400 hover:text-red-600 transition-all uppercase tracking-widest"><LogOut size={20}/> Sign Out</button>
      </div>

      <NewProjectModal isOpen={isProjOpen} onClose={() => setIsProjOpen(false)} onRefresh={fetchTreeData} />
      <NewEntityModal isOpen={isEntOpen} onClose={() => setIsEntOpen(false)} onRefresh={fetchTreeData} />
    </div>
  );
}