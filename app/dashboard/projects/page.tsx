"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Search, Plus, LayoutGrid } from "lucide-react";
import ProjectDashboard from "./ProjectDashboard";
import NewProjectModal from "@/components/NewProjectModal";

function ProjectMaster() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => { if (!id) fetch(); }, [id]);

  const fetch = async () => {
    const { data } = await supabase.from("projects").select("*").is('deleted_at', null).order('name');
    setItems(data || []);
  };

  if (id) return <ProjectDashboard projectId={id} onBack={() => router.push('/dashboard/projects')} />;

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">Projects</h1>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-bold">+ New project</button>
        </div>
        <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
        <input placeholder="Filter projects..." className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 text-sm outline-none" onChange={e => setSearch(e.target.value)} /></div>
      </header>
      <main className="flex-1 overflow-auto p-8">
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm min-w-full overflow-hidden">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
              <tr>
                <th className="p-6 border-r border-slate-100 uppercase text-[10px] font-bold tracking-widest">Name</th>
                <th className="p-6 border-r border-slate-100 uppercase text-[10px] font-bold tracking-widest">Completion</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).map(item => (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer" onClick={() => router.push(`/dashboard/projects?id=${item.id}`)}>
                  <td className="p-6 border-r border-slate-50 font-medium text-slate-900">{item.name}</td>
                  <td className="p-6 font-medium text-slate-500">{item.estimated_completion_date || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <NewProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onRefresh={fetch} />
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><ProjectMaster /></Suspense>; }