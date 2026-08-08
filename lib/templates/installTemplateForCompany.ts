// lib/templates/installTemplateForCompany.ts
// Shared "install a marketplace template into a company" logic, used by
// both the marketplace's own install route (app/api/templates/[slug]/install)
// and the law-firm-au onboarding flow (app/auth/callback/route.ts), which
// needs to install the Law Firm template server-side the moment a new
// signup's email gets confirmed -- there's no browser session yet to make
// an authenticated fetch() call with at that point.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { adminClient } from "@/lib/documentTemplateAuth";
import { installPrecedentLibrary, TEMPLATES_WITH_PRECEDENT_LIBRARY } from "@/lib/precedents/installLibrary";

export async function installTemplateForCompany({
  supabase, admin, companyId, userId, slug, resolutions = {}, installDashboards = false, installExtras = {},
}: {
  supabase: SupabaseClient;
  admin: ReturnType<typeof adminClient>;
  companyId: string;
  userId: string;
  slug: string;
  resolutions?: Record<string, unknown>;
  installDashboards?: boolean;
  // Opt-in, additive extras beyond tables/fields/dashboards -- see
  // supabase/migrations/20260808180300_install_extras.sql for what each
  // one does.
  installExtras?: { tablesVisibility?: boolean; defaultViews?: boolean; pages?: boolean; settings?: boolean };
}): Promise<{ data?: Record<string, unknown>; precedents?: unknown; error?: string }> {
  const { data: template } = await admin
    .from("template_definitions").select("id, is_published, owner_company_id").eq("slug", slug).maybeSingle();
  if (!template || (!template.is_published && template.owner_company_id !== companyId)) {
    return { error: "Template not found" };
  }

  const { data, error } = await supabase.rpc("install_company_template", {
    p_company_id: companyId,
    p_template_id: template.id,
    p_resolutions: resolutions,
    p_install_dashboards: installDashboards,
    p_install_extras: installExtras,
  });
  if (error) return { error: error.message };

  // Non-fatal: the template itself installed fine, and failing the whole
  // install over the precedent library would be a worse outcome than a
  // firm having to top it up from Settings afterwards.
  let precedents;
  if (TEMPLATES_WITH_PRECEDENT_LIBRARY.has(slug)) {
    const { result, error: precedentError } = await installPrecedentLibrary(admin, companyId, userId);
    if (precedentError) console.error("[install-template] precedent library failed:", precedentError);
    else precedents = result;
  }

  return { data, precedents };
}
