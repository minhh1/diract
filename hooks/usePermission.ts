import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export function usePermission(actionSlug: string) {
  const [isAllowed, setIsAllowed] = useState(true);

  useEffect(() => {
    async function checkPermission() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      // Company Admins bypass all restriction checks
      if (profile?.role === 'company_admin') {
        setIsAllowed(true);
        return;
      }

      // Check specific permission slug
      const { data: perm } = await supabase
        .from("company_permissions")
        .select("is_allowed")
        .eq("profile_id", user.id)
        .eq("action_slug", actionSlug)
        .single();

      if (perm) setIsAllowed(perm.is_allowed);
    }
    checkPermission();
  }, [actionSlug]);

  return isAllowed;
}