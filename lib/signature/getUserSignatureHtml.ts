// lib/signature/getUserSignatureHtml.ts
// Resolves a user's fully-merged, rendered email signature -- company
// branding (company_email_signature_settings, falling back to companies.
// logo_url/name for anything the firm hasn't set yet) layered with that
// user's own personal fields (user_email_signature_settings, falling back
// to profiles.full_name for the display name). Shared by the Settings tab's
// live preview, the Gmail native-signature push, and the Outlook add-in's
// identity endpoint, so all three render exactly the same thing.
import {
  renderSignatureHtml,
  SIGNATURE_TEMPLATES,
  EMAIL_SAFE_FONTS,
  type CompanySignatureSettings,
  type UserSignatureSettings,
  type SignatureTemplateId,
} from "@/lib/signature/renderSignatureHtml";

export interface ResolvedSignature {
  html: string;
  company: CompanySignatureSettings;
  user: UserSignatureSettings;
  enabled: boolean;
}

function coerceTemplateId(value: unknown): SignatureTemplateId {
  return (SIGNATURE_TEMPLATES as readonly string[]).includes(value as string) ? (value as SignatureTemplateId) : "logo_left";
}

function coerceFont(value: unknown): string {
  return (EMAIL_SAFE_FONTS as readonly string[]).includes(value as string) ? (value as string) : "Arial";
}

// admin: service-role client (see lib/documentTemplateAuth.ts's adminClient()).
export async function getUserSignatureHtml(admin: any, userId: string): Promise<ResolvedSignature | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, active_company_id")
    .eq("id", userId)
    .maybeSingle();
  const companyId = profile?.active_company_id;
  if (!companyId) return null;

  const [{ data: companyRow }, { data: companySig }, { data: userSig }] = await Promise.all([
    admin.from("companies").select("name, logo_url").eq("id", companyId).maybeSingle(),
    admin.from("company_email_signature_settings").select("*").eq("company_id", companyId).maybeSingle(),
    admin.from("user_email_signature_settings").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const company: CompanySignatureSettings = {
    templateId: coerceTemplateId(companySig?.template_id),
    logoUrl: companySig?.logo_url || companyRow?.logo_url || null,
    brandColor: companySig?.brand_color || null,
    fontFamily: coerceFont(companySig?.font_family),
    baseFontSize: companySig?.base_font_size || 12,
    companyName: companySig?.company_name || companyRow?.name || null,
    companyAddress: companySig?.company_address || null,
    companyPhone: companySig?.company_phone || null,
    companyWebsite: companySig?.company_website || null,
    links: Array.isArray(companySig?.links) ? companySig.links : null,
  };

  const user: UserSignatureSettings = {
    displayName: userSig?.display_name || profile?.full_name || null,
    jobTitle: userSig?.job_title || null,
    directPhone: userSig?.direct_phone || null,
    mobilePhone: userSig?.mobile_phone || null,
    photoUrl: userSig?.photo_url || null,
  };

  const enabled = userSig?.enabled !== false;

  return { html: renderSignatureHtml(company, user), company, user, enabled };
}
