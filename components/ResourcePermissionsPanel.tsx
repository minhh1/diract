// components/ResourcePermissionsPanel.tsx
// Manage-access panel for a single custom table or custom dashboard, backed
// by the resource_permissions table (see
// supabase/migrations/20260801400000_resource_permissions.sql for the full
// access model and RLS this UI reflects). Drop this into a table/dashboard
// builder page's header.
//
// - The permission list itself is visible to any company member, whether
//   or not they have a role on this resource -- so this component always
//   renders and loads for anyone, no isAdmin gate on opening it.
// - Only a company admin or someone holding 'admin' on this specific
//   resource can add people, change roles, or remove someone -- RLS
//   enforces this for real; the UI just hides those controls otherwise.
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/hooks/useProfile";
import { Users, X, Plus, Loader2, Trash2 } from "lucide-react";

type Role = "admin" | "editor" | "viewer";
type ResourceType = "table" | "dashboard";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface PermissionRow {
  id: string;
  user_id: string;
  role: Role;
}

interface Props {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  companyId: string;
}

const ROLES: Role[] = ["admin", "editor", "viewer"];
const ROLE_LABELS: Record<Role, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

export default function ResourcePermissionsPanel({ resourceType, resourceId, resourceName, companyId }: Props) {
  const { data: profile } = useProfile();
  const currentUserId = profile?.id;
  const isCompanyAdmin = !!profile?.isAdmin;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [addingUserId, setAddingUserId] = useState("");
  const [addingRole, setAddingRole] = useState<Role>("viewer");
  const [saving, setSaving] = useState(false);

  const myRole = permissions.find(p => p.user_id === currentUserId)?.role;
  const canManage = isCompanyAdmin || myRole === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: perms }, { data: memberships }] = await Promise.all([
      supabase.from("resource_permissions")
        .select("id, user_id, role")
        .eq("resource_type", resourceType).eq("resource_id", resourceId),
      supabase.from("company_memberships").select("user_id").eq("company_id", companyId),
    ]);
    setPermissions((perms || []) as PermissionRow[]);
    if (memberships?.length) {
      const { data: profs } = await supabase.from("profiles")
        .select("id, full_name, email").in("id", memberships.map((m: { user_id: string }) => m.user_id));
      setMembers(profs || []);
    }
    setLoading(false);
  }, [resourceType, resourceId, companyId]);

  useEffect(() => {
    if (!open) return;
    // Deferred to a microtask so the panel's own open/close render commits
    // first -- load()'s first line is a setState, and calling it straight
    // from the effect body causes a same-tick cascading render.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [open, load]);

  const profileFor = (id: string) => members.find(p => p.id === id);
  const unassigned = members.filter(p => !permissions.some(perm => perm.user_id === p.id));

  const handleAdd = async () => {
    if (!addingUserId || !currentUserId) return;
    setSaving(true);
    const { error } = await supabase.from("resource_permissions").insert({
      company_id: companyId, resource_type: resourceType, resource_id: resourceId,
      user_id: addingUserId, role: addingRole, created_by: currentUserId,
    });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setAddingUserId("");
    load();
  };

  const handleRoleChange = async (permId: string, role: Role) => {
    const prev = permissions;
    setPermissions(p => p.map(x => x.id === permId ? { ...x, role } : x));
    const { error } = await supabase.from("resource_permissions").update({ role }).eq("id", permId);
    if (error) { alert(error.message); setPermissions(prev); }
  };

  const handleRemove = async (permId: string) => {
    const prev = permissions;
    setPermissions(p => p.filter(x => x.id !== permId));
    const { error } = await supabase.from("resource_permissions").delete().eq("id", permId);
    if (error) { alert(error.message); setPermissions(prev); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
      >
        <Users size={13} /> Manage access
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-bold text-slate-800 truncate pr-4">Access to &quot;{resourceName}&quot;</p>
              <button onClick={() => setOpen(false)} className="shrink-0"><X size={16} className="text-slate-400" /></button>
            </div>
            <p className="text-[10px] text-slate-400 mb-4">
              Everyone in the company can see this list. {canManage ? "You can add people and change roles below." : "Only an admin here can add people or change roles."}
            </p>

            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
            ) : (
              <div className="space-y-2 mb-4">
                {permissions.length === 0 && (
                  <p className="text-[11px] text-slate-400 py-3">No one has an explicit role yet — visibility follows the company default.</p>
                )}
                {permissions.map(perm => {
                  const prof = profileFor(perm.user_id);
                  return (
                    <div key={perm.id} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-2.5">
                      <p className="text-[11px] font-bold text-slate-700 truncate pr-3">{prof?.full_name || prof?.email || perm.user_id}</p>
                      {canManage ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={perm.role}
                            onChange={e => handleRoleChange(perm.id, e.target.value as Role)}
                            className="text-[10px] font-bold bg-white border border-slate-200 rounded-full px-2.5 py-1 outline-none appearance-none"
                          >
                            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                          <button onClick={() => handleRemove(perm.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">{ROLE_LABELS[perm.role]}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {canManage && (
              <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                <select
                  value={addingUserId}
                  onChange={e => setAddingUserId(e.target.value)}
                  className="flex-1 min-w-0 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-full px-3 py-2 outline-none appearance-none"
                >
                  <option value="">Add person...</option>
                  {unassigned.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
                <select
                  value={addingRole}
                  onChange={e => setAddingRole(e.target.value as Role)}
                  className="text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-full px-3 py-2 outline-none appearance-none shrink-0"
                >
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!addingUserId || saving}
                  className="p-2.5 bg-slate-900 text-white rounded-full disabled:opacity-40 shrink-0"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
