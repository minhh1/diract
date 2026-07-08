// components/dashboard/tabs/SubProjectsTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Loader2, FolderKanban, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SubProjectsTab({ recordId }: { recordId: string }) {
  const [subProjects, setSubProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, status, created_at')
      .eq('parent_project_id', recordId)
      .is('deleted_at', null)
      .order('created_at')
      .then(({ data }) => {
        setSubProjects(data || []);
        setLoading(false);
      });
  }, [recordId]);

  const handleCreate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles')
      .select('active_company_id')
      .eq('id', user?.id)
      .single();

    const { data: parent } = await supabase
      .from('projects')
      .select('name')
      .eq('id', recordId)
      .single();

    const parentName = parent?.name || '';
    const baseName = parentName.includes('/')
      ? parentName.split('/').slice(-1)[0].trim()
      : parentName;

    const { data } = await supabase
      .from('projects')
      .insert({
        name: `${baseName}/New sub-project`,
        company_id: prof?.active_company_id,   // ← prof is now defined above
        parent_project_id: recordId,
      })
      .select('id')
      .single();

    if (data) router.push(`/dashboard/projects?id=${data.id}`);
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-slate-300" size={20} />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {subProjects.length} sub-project{subProjects.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold"
        >
          <Plus size={13} /> New sub-project
        </button>
      </div>

      {subProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <FolderKanban size={32} className="text-slate-200" />
          <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
            No sub-projects yet
          </p>
        </div>
      ) : (
        subProjects.map(sp => (
          <button
            key={sp.id}
            onClick={() => router.push(`/dashboard/projects?id=${sp.id}`)}
            className="w-full flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/20 transition-all text-left group"
          >
            <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <FolderKanban size={16} className="text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-800 truncate">{sp.name}</p>
              {sp.status && (
                <p className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                  {sp.status}
                </p>
              )}
            </div>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
          </button>
        ))
      )}
    </div>
  );
}