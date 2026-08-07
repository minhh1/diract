// components/settings/EmailSignatureSettingsTab.tsx
// Company-wide email signature: firm branding (admin-only -- template,
// logo, colour, font, company details, links) and each user's own personal
// details (name/title/phone/photo), with a live preview rendered by the
// same lib/signature/renderSignatureHtml.ts every other consumer (Gmail
// native push, the Outlook add-in) shares -- so what's shown here is
// exactly what ends up in a real email, not an approximation.
//
// Fixed, customisable templates rather than a free-form drag/drop builder
// (deliberate choice -- see the three SignatureTemplateId options): a
// handful of professionally laid-out designs with editable content, so a
// firm can't accidentally build a broken-looking signature.
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Upload, Trash2, Loader2, Check, Lock, Plus, X, Send, RefreshCw, AlertTriangle } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import {
  renderSignatureHtml,
  SIGNATURE_TEMPLATES,
  EMAIL_SAFE_FONTS,
  type SignatureTemplateId,
  type CompanySignatureSettings,
  type UserSignatureSettings,
  type SignatureLink,
} from "@/lib/signature/renderSignatureHtml";

const TEMPLATE_LABELS: Record<SignatureTemplateId, string> = {
  logo_left: "Logo left",
  logo_top: "Logo on top",
  compact_inline: "Compact (one line)",
};

function AdminOnlyNote() {
  return <span className="flex items-center gap-1 text-[10px] text-slate-300"><Lock size={10} /> Admin only</span>;
}

function Preview({ company, user }: { company: CompanySignatureSettings; user: UserSignatureSettings }) {
  const html = useMemo(() => renderSignatureHtml(company, user), [company, user]);
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 overflow-x-auto">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Live preview</p>
      <iframe srcDoc={`<html><body style="margin:0;">${html}</body></html>`} sandbox="allow-same-origin" title="Signature preview" className="w-full border-0" style={{ height: 180 }} />
    </div>
  );
}

export default function EmailSignatureSettingsTab() {
  const { isAdmin } = useCompany();

  const [company, setCompany] = useState<CompanySignatureSettings>({
    templateId: "logo_left", logoUrl: null, brandColor: "#4f46e5", fontFamily: "Arial", baseFontSize: 12,
    companyName: null, companyAddress: null, companyPhone: null, companyWebsite: null, links: null,
  });
  const [companyDefaults, setCompanyDefaults] = useState<{ name: string | null; logoUrl: string | null }>({ name: null, logoUrl: null });
  const [user, setUser] = useState<UserSignatureSettings>({ displayName: null, jobTitle: null, directPhone: null, mobilePhone: null, photoUrl: null });
  const [profileName, setProfileName] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [userSaved, setUserSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [pushingGmail, setPushingGmail] = useState(false);
  const [gmailPushError, setGmailPushError] = useState<string | null>(null);
  const [gmailReconnectNeeded, setGmailReconnectNeeded] = useState(false);
  const [gmailPushed, setGmailPushed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/company/email-signature").then(r => r.json()),
      fetch("/api/user/email-signature").then(r => r.json()),
      fetch("/api/gmail/signature").then(r => r.json()),
    ]).then(([companyJson, userJson, gmailJson]) => {
      if (cancelled) return;
      setGmailConnected(!!gmailJson.connected);
      setGmailEmail(gmailJson.email || null);
      if (companyJson.settings) {
        setCompany({
          templateId: companyJson.settings.template_id, logoUrl: companyJson.settings.logo_url,
          brandColor: companyJson.settings.brand_color || "#4f46e5", fontFamily: companyJson.settings.font_family,
          baseFontSize: companyJson.settings.base_font_size, companyName: companyJson.settings.company_name,
          companyAddress: companyJson.settings.company_address, companyPhone: companyJson.settings.company_phone,
          companyWebsite: companyJson.settings.company_website, links: companyJson.settings.links,
        });
      }
      setCompanyDefaults(companyJson.companyDefaults || { name: null, logoUrl: null });
      if (userJson.settings) {
        setUser({
          displayName: userJson.settings.display_name, jobTitle: userJson.settings.job_title,
          directPhone: userJson.settings.direct_phone, mobilePhone: userJson.settings.mobile_phone,
          photoUrl: userJson.settings.photo_url,
        });
      }
      setProfileName(userJson.preview?.user?.displayName || null);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // What the renderer actually sees -- falls back to the firm's main logo
  // and the signed-in user's profile name, exactly like
  // lib/signature/getUserSignatureHtml.ts does server-side, so the preview
  // matches what a real push/insertion would produce even before either
  // section has been saved.
  const previewCompany: CompanySignatureSettings = { ...company, logoUrl: company.logoUrl || companyDefaults.logoUrl, companyName: company.companyName || companyDefaults.name };
  const previewUser: UserSignatureSettings = { ...user, displayName: user.displayName || profileName };

  const saveCompany = async () => {
    setSavingCompany(true);
    setError(null);
    const res = await fetch("/api/company/email-signature", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: company.templateId, logoUrl: company.logoUrl, brandColor: company.brandColor,
        fontFamily: company.fontFamily, baseFontSize: company.baseFontSize, companyName: company.companyName,
        companyAddress: company.companyAddress, companyPhone: company.companyPhone, companyWebsite: company.companyWebsite,
        links: company.links,
      }),
    });
    setSavingCompany(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || "Failed to save branding"); return; }
    setCompanySaved(true);
    setTimeout(() => setCompanySaved(false), 1500);
  };

  const saveUser = async () => {
    setSavingUser(true);
    setError(null);
    const res = await fetch("/api/user/email-signature", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: user.displayName, jobTitle: user.jobTitle, directPhone: user.directPhone,
        mobilePhone: user.mobilePhone, photoUrl: user.photoUrl, enabled: true,
      }),
    });
    setSavingUser(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || "Failed to save your details"); return; }
    setUserSaved(true);
    setTimeout(() => setUserSaved(false), 1500);
  };

  const handleLogoUpload = async (file: File) => {
    setError(null);
    setUploadingLogo(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/company/email-signature/logo", { method: "POST", body: form });
    const json = await res.json();
    setUploadingLogo(false);
    if (!res.ok) { setError(json.error || "Upload failed"); return; }
    setCompany(c => ({ ...c, logoUrl: json.logo_url }));
  };

  const handleLogoRemove = async () => {
    setError(null);
    const res = await fetch("/api/company/email-signature/logo", { method: "DELETE" });
    if (!res.ok) { setError("Could not remove the logo."); return; }
    setCompany(c => ({ ...c, logoUrl: null }));
  };

  const pushToGmail = async () => {
    setPushingGmail(true);
    setGmailPushError(null);
    setGmailReconnectNeeded(false);
    const res = await fetch("/api/gmail/signature", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setPushingGmail(false);
    if (!res.ok) {
      setGmailPushError(json.error || "Failed to push signature to Gmail");
      setGmailReconnectNeeded(!!json.reconnectRequired);
      return;
    }
    setGmailPushed(true);
    setTimeout(() => setGmailPushed(false), 1500);
  };

  const updateLink = (i: number, patch: Partial<SignatureLink>) => {
    setCompany(c => ({ ...c, links: (c.links || []).map((l, idx) => idx === i ? { ...l, ...patch } : l) }));
  };
  const addLink = () => setCompany(c => ({ ...c, links: [...(c.links || []), { label: "", url: "" }].slice(0, 6) }));
  const removeLink = (i: number) => setCompany(c => ({ ...c, links: (c.links || []).filter((_, idx) => idx !== i) }));

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-300" size={20} /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Firm branding ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Firm branding</p>
          {!isAdmin && <AdminOnlyNote />}
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Layout</label>
          <div className="flex gap-2 flex-wrap">
            {SIGNATURE_TEMPLATES.map(t => (
              <button key={t} disabled={!isAdmin} onClick={() => setCompany(c => ({ ...c, templateId: t }))}
                className={`px-4 py-2 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-60 ${company.templateId === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                {TEMPLATE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {company.logoUrl || companyDefaults.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl || companyDefaults.logoUrl || ""} alt="Signature logo" className="h-16 max-w-[200px] object-contain rounded-xl border border-slate-100 p-2" />
          ) : (
            <div className="h-16 w-32 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-300">No logo</div>
          )}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
                {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {company.logoUrl ? "Replace" : "Upload logo"}
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" disabled={uploadingLogo}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
              </label>
              {company.logoUrl && <button onClick={handleLogoRemove} className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Use the firm's main logo instead"><Trash2 size={15} /></button>}
            </div>
          )}
        </div>
        {!company.logoUrl && companyDefaults.logoUrl && (
          <p className="text-[10px] text-slate-400 -mt-4">Using your firm&apos;s main logo. Upload a different one just for signatures if you&apos;d like.</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Brand colour</label>
            <div className="flex items-center gap-2">
              <input type="color" disabled={!isAdmin} value={company.brandColor || "#4f46e5"} onChange={e => setCompany(c => ({ ...c, brandColor: e.target.value }))}
                className="h-9 w-12 rounded-lg border border-slate-200 disabled:opacity-60" />
              <input type="text" disabled={!isAdmin} value={company.brandColor || ""} onChange={e => setCompany(c => ({ ...c, brandColor: e.target.value }))}
                placeholder="#4f46e5" className="flex-1 px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Font</label>
            <div className="flex items-center gap-2">
              <select disabled={!isAdmin} value={company.fontFamily} onChange={e => setCompany(c => ({ ...c, fontFamily: e.target.value }))}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none bg-white disabled:opacity-60">
                {EMAIL_SAFE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <input type="number" min={9} max={20} disabled={!isAdmin} value={company.baseFontSize} onChange={e => setCompany(c => ({ ...c, baseFontSize: Number(e.target.value) }))}
                className="w-16 px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Firm name</label>
            <input type="text" disabled={!isAdmin} value={company.companyName || ""} onChange={e => setCompany(c => ({ ...c, companyName: e.target.value }))}
              placeholder={companyDefaults.name || "Huynh Lawyers"} className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Website</label>
            <input type="text" disabled={!isAdmin} value={company.companyWebsite || ""} onChange={e => setCompany(c => ({ ...c, companyWebsite: e.target.value }))}
              placeholder="www.example.com.au" className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Main phone</label>
            <input type="text" disabled={!isAdmin} value={company.companyPhone || ""} onChange={e => setCompany(c => ({ ...c, companyPhone: e.target.value }))}
              placeholder="(02) 0000 0000" className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Address</label>
            <input type="text" disabled={!isAdmin} value={company.companyAddress || ""} onChange={e => setCompany(c => ({ ...c, companyAddress: e.target.value }))}
              placeholder="Level 1, 123 Example St, Sydney NSW 2000" className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Links (LinkedIn, book a meeting, etc.)</label>
          <div className="space-y-2">
            {(company.links || []).map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="text" disabled={!isAdmin} value={l.label} onChange={e => updateLink(i, { label: e.target.value })} placeholder="Label"
                  className="w-32 px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
                <input type="text" disabled={!isAdmin} value={l.url} onChange={e => updateLink(i, { url: e.target.value })} placeholder="https://..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 disabled:opacity-60" />
                {isAdmin && <button onClick={() => removeLink(i)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><X size={14} /></button>}
              </div>
            ))}
            {isAdmin && (company.links || []).length < 6 && (
              <button onClick={addLink} className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"><Plus size={12} /> Add link</button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={saveCompany} disabled={savingCompany}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {savingCompany ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save branding
            </button>
            {companySaved && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</span>}
          </div>
        )}
      </div>

      {/* ── Your details ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-6">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your details</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Display name</label>
            <input type="text" value={user.displayName || ""} onChange={e => setUser(u => ({ ...u, displayName: e.target.value }))}
              placeholder={profileName || "Jane Smith"} className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Job title</label>
            <input type="text" value={user.jobTitle || ""} onChange={e => setUser(u => ({ ...u, jobTitle: e.target.value }))}
              placeholder="Senior Associate" className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Direct phone</label>
            <input type="text" value={user.directPhone || ""} onChange={e => setUser(u => ({ ...u, directPhone: e.target.value }))}
              placeholder="(02) 1111 1111" className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Mobile</label>
            <input type="text" value={user.mobilePhone || ""} onChange={e => setUser(u => ({ ...u, mobilePhone: e.target.value }))}
              placeholder="0400 000 000" className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveUser} disabled={savingUser}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
            {savingUser ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save my details
          </button>
          {userSaved && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</span>}
        </div>
      </div>

      {/* ── Gmail ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gmail</p>
        {gmailConnected === null ? (
          <Loader2 size={14} className="animate-spin text-slate-300" />
        ) : gmailConnected ? (
          <>
            <p className="text-[12px] text-slate-500">Connected as <span className="font-medium text-slate-700">{gmailEmail}</span>. Pushing sets this as your actual Gmail signature -- it will appear automatically in Gmail&apos;s own web, mobile and desktop apps, not just here.</p>
            <div className="flex items-center gap-2">
              <button onClick={pushToGmail} disabled={pushingGmail}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
                {pushingGmail ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Push to Gmail
              </button>
              {gmailPushed && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><Check size={12} /> Applied in Gmail</span>}
            </div>
            {gmailPushError && (
              <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl p-3">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>
                  {gmailPushError}
                  {gmailReconnectNeeded && (
                    <button onClick={() => { window.location.href = "/api/gmail/auth"; }} className="ml-2 inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700">
                      <RefreshCw size={11} /> Reconnect Gmail
                    </button>
                  )}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-[12px] text-slate-500">Connect Gmail to push this signature natively -- Gmail will apply it automatically to every new message you compose, anywhere.</p>
            <button onClick={() => { window.location.href = "/api/gmail/auth"; }}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors">
              Connect Gmail
            </button>
          </>
        )}
      </div>

      {/* ── Outlook ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outlook</p>
          {!isAdmin && <AdminOnlyNote />}
        </div>
        <p className="text-[12px] text-slate-500">
          Microsoft doesn&apos;t give any app a way to set Outlook&apos;s native signature directly -- the real mechanism is an add-in that inserts it automatically every time someone starts composing. It&apos;s built and ready; a Microsoft 365 admin just needs to install it once for the whole firm.
        </p>
        {isAdmin && (
          <ol className="text-[12px] text-slate-600 space-y-1.5 list-decimal list-inside">
            <li>Go to <a href="https://admin.microsoft.com" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-700 font-medium">admin.microsoft.com</a> → Settings → Integrated apps → Upload custom apps.</li>
            <li>Provide this manifest URL: <code className="px-1.5 py-0.5 bg-slate-50 rounded text-[11px]">https://diract.io/outlook-addin/manifest.json</code></li>
            <li>Assign it to everyone (or the staff you want it for) and deploy.</li>
            <li>It can take 24&ndash;72 hours to appear in everyone&apos;s Outlook. Each person&apos;s signature comes from their own details saved above -- nothing further to configure per person.</li>
          </ol>
        )}
        <p className="text-[10px] text-slate-400">Known limitation: some Outlook versions don&apos;t always preserve font styling exactly (a bug on Microsoft&apos;s side, not something we control) -- Gmail&apos;s rendering is more reliable.</p>
      </div>

      {error && <p className="text-[11px] text-red-500 px-2">{error}</p>}

      {/* ── Preview ── */}
      <Preview company={previewCompany} user={previewUser} />
    </div>
  );
}
