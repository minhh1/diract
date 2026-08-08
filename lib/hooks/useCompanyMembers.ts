// lib/hooks/useCompanyMembers.ts
// This company's members (profile fields only) for @mention autocomplete
// and the "start a DM" picker. Simple tier -- membership rarely changes
// mid-session, no realtime needed.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface CompanyMember {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function useCompanyMembers(companyId: string | null) {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!companyId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data: memberships } = await supabase.from("company_memberships").select("user_id").eq("company_id", companyId);
      const userIds = (memberships ?? []).map((m) => m.user_id);
      if (!userIds.length) { if (active) { setMembers([]); setLoading(false); } return; }
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds);
      if (!active) return;
      setMembers((profiles ?? []) as CompanyMember[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [companyId]);

  return { members, loading };
}
