// lib/signature/renderSignatureHtml.ts
// Single source of truth for what a firm's email signature looks like --
// every consumer (the Settings tab's live preview, Gmail's native
// sendAs.signature push, and the Outlook add-in's compose-time insertion)
// renders through this one function, so they can never drift apart.
//
// Table-based markup with only inline styles, no <style> block and no CSS
// classes -- matching lib/email/templates.ts's renderShell convention, but
// stricter here: this fragment gets pasted directly into a contentEditable
// compose editor (Gmail's, Outlook's) as well as into full email bodies, so
// it can't rely on a parent document's <head> at all. Plain string
// templates, no JSX/react-email, matching this codebase's existing
// preference (see lib/email/templates.ts's own header comment).
//
// Deliberately NOT resolving the "fall back to companies.logo_url" or
// "fall back to profiles.full_name" defaults here -- this function is pure
// and only knows about the two settings rows it's given. Callers (the
// signature settings API routes) resolve those fallbacks before calling in,
// since only they have the company/profile rows to fall back to.
export const EMAIL_SAFE_FONTS = ["Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana"] as const;
export type EmailSafeFont = (typeof EMAIL_SAFE_FONTS)[number];

export const SIGNATURE_TEMPLATES = ["logo_left", "logo_top", "compact_inline"] as const;
export type SignatureTemplateId = (typeof SIGNATURE_TEMPLATES)[number];

export interface SignatureLink {
  label: string;
  url: string;
}

export interface CompanySignatureSettings {
  templateId: SignatureTemplateId;
  logoUrl: string | null;
  brandColor: string | null;
  fontFamily: string;
  baseFontSize: number;
  companyName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyWebsite: string | null;
  links: SignatureLink[] | null;
}

export interface UserSignatureSettings {
  displayName: string | null;
  jobTitle: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  photoUrl: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// href values go through the same escape (not a URL-validity check) --
// good enough for the closed set of contexts this renders into (a firm's
// own compose editor / sendAs signature), consistent with how the rest of
// this codebase treats admin/self-entered URLs (e.g. company_custom_fields'
// link fields) as trusted-enough content, not attacker input.
function safeHref(url: string): string {
  return escapeHtml(url.trim());
}

function resolveFont(fontFamily: string): string {
  const font = (EMAIL_SAFE_FONTS as readonly string[]).includes(fontFamily) ? fontFamily : "Arial";
  return font === "Times New Roman" ? "'Times New Roman', Times, serif" : font === "Georgia" ? "Georgia, serif" : `${font}, sans-serif`;
}

function renderLinksRow(links: SignatureLink[] | null, color: string, fontSize: number): string {
  if (!links?.length) return "";
  const items = links
    .map(l => `<a href="${safeHref(l.url)}" style="color:${color};text-decoration:none;font-size:${fontSize}px;">${escapeHtml(l.label)}</a>`)
    .join(`<span style="color:#cbd5e1;padding:0 6px;">|</span>`);
  return `<tr><td style="padding-top:8px;">${items}</td></tr>`;
}

function renderLogo(logoUrl: string | null, maxWidth: number): string {
  if (!logoUrl) return "";
  return `<img src="${safeHref(logoUrl)}" alt="" style="display:block;max-width:${maxWidth}px;max-height:${maxWidth}px;border:0;" />`;
}

function renderPhoto(photoUrl: string | null, size: number): string {
  if (!photoUrl) return "";
  return `<img src="${safeHref(photoUrl)}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:0;" />`;
}

function contactLines(user: UserSignatureSettings, company: CompanySignatureSettings, color: string, fontSize: number): string {
  const lines: string[] = [];
  if (user.directPhone) lines.push(`P: ${escapeHtml(user.directPhone)}`);
  if (user.mobilePhone) lines.push(`M: ${escapeHtml(user.mobilePhone)}`);
  if (!user.directPhone && !user.mobilePhone && company.companyPhone) lines.push(`P: ${escapeHtml(company.companyPhone)}`);
  if (company.companyWebsite) lines.push(escapeHtml(company.companyWebsite));
  if (!lines.length) return "";
  return `<tr><td style="padding-top:4px;color:#64748b;font-size:${fontSize}px;">${lines.join(" &nbsp;&nbsp; ")}</td></tr>`;
}

function renderLogoLeft(company: CompanySignatureSettings, user: UserSignatureSettings): string {
  const color = company.brandColor || "#4f46e5";
  const font = resolveFont(company.fontFamily);
  const size = company.baseFontSize;
  const name = escapeHtml(user.displayName || "");
  const title = [user.jobTitle, company.companyName].filter((s): s is string => !!s).map(escapeHtml).join(", ");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${font};font-size:${size}px;color:#0f172a;">
  <tr>
    ${company.logoUrl ? `<td style="padding-right:16px;vertical-align:top;">${renderLogo(company.logoUrl, 90)}</td>` : ""}
    <td style="border-left:2px solid ${color};padding-left:16px;vertical-align:top;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="font-weight:bold;font-size:${size + 2}px;">${name}</td></tr>
        ${title ? `<tr><td style="color:${color};padding-top:2px;">${title}</td></tr>` : ""}
        ${contactLines(user, company, color, size - 1)}
        ${company.companyAddress ? `<tr><td style="padding-top:4px;color:#64748b;font-size:${size - 1}px;">${escapeHtml(company.companyAddress)}</td></tr>` : ""}
        ${renderLinksRow(company.links, color, size - 1)}
      </table>
    </td>
  </tr>
</table>`;
}

function renderLogoTop(company: CompanySignatureSettings, user: UserSignatureSettings): string {
  const color = company.brandColor || "#4f46e5";
  const font = resolveFont(company.fontFamily);
  const size = company.baseFontSize;
  const name = escapeHtml(user.displayName || "");
  const title = [user.jobTitle, company.companyName].filter((s): s is string => !!s).map(escapeHtml).join(", ");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${font};font-size:${size}px;color:#0f172a;">
  ${company.logoUrl ? `<tr><td style="padding-bottom:10px;">${renderLogo(company.logoUrl, 140)}</td></tr>` : ""}
  <tr><td style="font-weight:bold;font-size:${size + 2}px;border-top:2px solid ${color};padding-top:8px;">${name}</td></tr>
  ${title ? `<tr><td style="color:${color};padding-top:2px;">${title}</td></tr>` : ""}
  ${contactLines(user, company, color, size - 1)}
  ${company.companyAddress ? `<tr><td style="padding-top:4px;color:#64748b;font-size:${size - 1}px;">${escapeHtml(company.companyAddress)}</td></tr>` : ""}
  ${renderLinksRow(company.links, color, size - 1)}
</table>`;
}

function renderCompactInline(company: CompanySignatureSettings, user: UserSignatureSettings): string {
  const color = company.brandColor || "#4f46e5";
  const font = resolveFont(company.fontFamily);
  const size = company.baseFontSize;
  const name = escapeHtml(user.displayName || "");
  const title = [user.jobTitle, company.companyName].filter((s): s is string => !!s).map(escapeHtml).join(", ");
  const phone = user.directPhone || user.mobilePhone || company.companyPhone;

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${font};font-size:${size}px;color:#0f172a;">
  <tr>
    ${user.photoUrl ? `<td style="padding-right:10px;vertical-align:middle;">${renderPhoto(user.photoUrl, 44)}</td>` : ""}
    <td style="vertical-align:middle;">
      <span style="font-weight:bold;">${name}</span>${title ? ` <span style="color:${color};">&mdash; ${title}</span>` : ""}${phone ? ` <span style="color:#64748b;">&nbsp;|&nbsp; ${escapeHtml(phone)}</span>` : ""}
    </td>
  </tr>
</table>`;
}

export function renderSignatureHtml(company: CompanySignatureSettings, user: UserSignatureSettings): string {
  switch (company.templateId) {
    case "logo_top": return renderLogoTop(company, user);
    case "compact_inline": return renderCompactInline(company, user);
    case "logo_left":
    default: return renderLogoLeft(company, user);
  }
}
