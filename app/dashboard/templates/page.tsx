// app/dashboard/templates/page.tsx
// Company-wide checklist template management, outside any single project's
// Checklist tab. Reuses TemplateManager in "page mode" (no onClose/projectId/
// onApply) — create/edit/reorder/delete only, since applying a template needs
// a target project (do that from the project's own Checklist tab instead).
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/services/schemaService";
import TemplateManager, { type Template } from "@/components/dashboard/TemplateManager";

interface Profile { id: string; full_name: string | null; email: string | null; }
interface Team { id: string; team_name: string; }

export default function TemplatesToolPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const cid = await getCompanyId();
    setCompanyId(cid);
    if (!cid) { setLoading(false); return; }
    const [{ data: profileData }, { data: teamData }, { data: templateData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('teams').select('id, team_name').eq('is_active', true),
      supabase.from('checklist_templates').select('*, items:checklist_template_items(*)').eq('company_id', cid).order('created_at'),
    ]);
    setProfiles(profileData || []);
    setTeams(teamData || []);
    setTemplates((templateData || []).map((t: any) => ({
      ...t, items: (t.items || []).sort((a: any, b: any) => a.display_order - b.display_order),
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateTemplate = async (name: string): Promise<Template | null> => {
    if (!companyId) return null;
    const { data: tpl } = await supabase.from('checklist_templates').insert({ company_id: companyId, name, record_table: 'projects' }).select().single();
    if (!tpl) return null;
    const newTemplate: Template = { id: tpl.id, name: tpl.name, items: [] };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0 flex items-center gap-6">
        <Link href="/dashboard" className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">Checklist templates</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">
            Reusable task lists — open a project&apos;s Checklist tab to apply one
          </p>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-8">
        {loading ? (
          <p className="text-[11px] text-slate-400 text-center py-8">Loading templates...</p>
        ) : !companyId ? (
          <p className="text-[11px] text-slate-400 text-center py-8">No active company found.</p>
        ) : (
          <div className="max-w-2xl mx-auto bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
            <TemplateManager
              templates={templates}
              setTemplates={setTemplates}
              profiles={profiles}
              teams={teams}
              companyId={companyId}
              onCreateTemplate={handleCreateTemplate}
            />
          </div>
        )}
      </main>
    </div>
  );
}
