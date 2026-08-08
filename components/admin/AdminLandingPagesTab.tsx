// components/admin/AdminLandingPagesTab.tsx
// Dashboard editor for the public marketing site's copy (app/(marketing)/),
// which is otherwise static code -- see lib/marketingPages/publishedContent.ts
// and app/api/marketing-pages/*. Locked to one specific user (checked
// server-side in every API route and in this tab's own gating in
// app/dashboard/admin/page.tsx) -- there is no company-admin-based access
// here, this is not a general-purpose admin feature.
//
// Draft edits autosave on blur; nothing on the live site changes until
// "Push live" is clicked for that specific page. Two page kinds today:
// hero-spotlight (home + /for/[audience]) and feature-detail (the 23
// bespoke feature deep-dive pages, Phase B) -- each with its own content
// shape and edit form below.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Newspaper, ExternalLink, Rocket, Loader2 } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface FeatureCopy {
  slug: string;
  title: string;
  body: string;
}

interface HeroSpotlightCopy {
  badge: string;
  headlineLine1: string;
  headlineLine2: string;
  subheadline: string;
  eyebrow: string;
  heading: string;
  primaryCtaLabel: string;
  features: FeatureCopy[];
}

interface FeatureDetailSection {
  key: string;
  eyebrow: string;
  title: string;
  body: string[];
}

interface FeatureDetailCopy {
  badgeText: string;
  headlineLine1: string;
  headlineLine2: string;
  subheadline: string;
  sections: FeatureDetailSection[];
}

type PageContent = HeroSpotlightCopy | FeatureDetailCopy;

interface PageRow {
  page_key: string;
  page_kind: "hero-spotlight" | "feature-detail" | "legal";
  draft_content: PageContent;
  published_content: PageContent | null;
  published_at: string | null;
  updated_at: string;
}

const PAGE_LABELS: Record<string, { title: string; url: string }> = {
  home: { title: "Homepage", url: "/" },
  "for/law-firm-au": { title: "For law firms", url: "/for/law-firm-au" },
  "for/property-developers-au": { title: "For property developers", url: "/for/property-developers-au" },
};

function pageLabel(page: PageRow): { title: string; url: string } {
  if (PAGE_LABELS[page.page_key]) return PAGE_LABELS[page.page_key];
  if (page.page_kind === "feature-detail") {
    return { title: (page.draft_content as FeatureDetailCopy).badgeText, url: `/${page.page_key}` };
  }
  return { title: page.page_key, url: `/${page.page_key}` };
}

function isPublishedUpToDate(page: PageRow): boolean {
  return !!page.published_content && JSON.stringify(page.published_content) === JSON.stringify(page.draft_content);
}

export default function AdminLandingPagesTab() {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/marketing-pages");
    const json = await res.json();
    setPages(json.pages ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useProgressBarWhile(loading);

  const selected = pages?.find(p => p.page_key === selectedKey) ?? null;

  const saveDraft = async (pageKey: string, content: PageContent) => {
    setPages(prev => prev?.map(p => (p.page_key === pageKey ? { ...p, draft_content: content } : p)) ?? prev);
    setSaving(true);
    setSaved(false);
    await fetch(`/api/marketing-pages/${pageKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_content: content }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const publish = async (pageKey: string) => {
    setPublishing(true);
    await fetch(`/api/marketing-pages/${pageKey}`, { method: "POST" });
    await load();
    setPublishing(false);
  };

  if (loading || !pages) return null;

  if (selected) {
    const label = pageLabel(selected);
    const upToDate = isPublishedUpToDate(selected);
    const commit = () => saveDraft(selected.page_key, pages.find(p => p.page_key === selected.page_key)!.draft_content);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedKey(null)}
            className="text-[12px] font-medium text-slate-400 hover:text-slate-600"
          >
            ← All pages
          </button>
          <div className="flex items-center gap-3">
            <a
              href={label.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-indigo-600"
            >
              View live page <ExternalLink size={12} />
            </a>
            <button
              onClick={() => publish(selected.page_key)}
              disabled={publishing || upToDate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {publishing ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
              {upToDate ? "Live" : "Push live"}
            </button>
          </div>
        </div>

        {selected.page_kind === "hero-spotlight" ? (
          <HeroSpotlightEditor
            label={label.title}
            content={selected.draft_content as HeroSpotlightCopy}
            saving={saving}
            saved={saved}
            onChange={next => setPages(prev => prev?.map(p => (p.page_key === selected.page_key ? { ...p, draft_content: next } : p)) ?? prev)}
            onBlur={commit}
          />
        ) : (
          <FeatureDetailEditor
            label={label.title}
            content={selected.draft_content as FeatureDetailCopy}
            saving={saving}
            saved={saved}
            onChange={next => setPages(prev => prev?.map(p => (p.page_key === selected.page_key ? { ...p, draft_content: next } : p)) ?? prev)}
            onBlur={commit}
          />
        )}
      </div>
    );
  }

  const homeAndAudiencePages = pages.filter(p => p.page_kind === "hero-spotlight");
  const featureDetailPages = pages.filter(p => p.page_kind === "feature-detail");
  const legalPages = pages.filter(p => p.page_kind === "legal");

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper size={14} className="text-indigo-500" />
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Landing pages</p>
        </div>
        <p className="text-[12px] text-slate-400 mb-4">
          Edit copy here, then Push live to update the real page. Nothing changes on the live site until you do.
        </p>

        <PageList title="Home & audience pages" pages={homeAndAudiencePages} onSelect={setSelectedKey} />
        <PageList title="Feature pages" pages={featureDetailPages} onSelect={setSelectedKey} />
        {legalPages.length > 0 && <PageList title="Legal (reference only)" pages={legalPages} onSelect={setSelectedKey} />}
      </div>
    </div>
  );
}

function PageList({ title, pages, onSelect }: { title: string; pages: PageRow[]; onSelect: (key: string) => void }) {
  if (pages.length === 0) return null;
  return (
    <div className="mb-5 last:mb-0">
      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-2">{title}</p>
      <div className="space-y-2">
        {pages.map(page => {
          const label = pageLabel(page);
          const upToDate = isPublishedUpToDate(page);
          return (
            <button
              key={page.page_key}
              onClick={() => onSelect(page.page_key)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors text-left"
            >
              <span className="text-[13px] font-medium text-slate-700">{label.title}</span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                  upToDate ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                }`}
              >
                {upToDate ? "Live" : page.published_content ? "Unpublished changes" : "Not published"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HeroSpotlightEditor({
  label, content, saving, saved, onChange, onBlur,
}: {
  label: string;
  content: HeroSpotlightCopy;
  saving: boolean;
  saved: boolean;
  onChange: (next: HeroSpotlightCopy) => void;
  onBlur: () => void;
}) {
  const update = (patch: Partial<HeroSpotlightCopy>) => onChange({ ...content, ...patch });
  const updateFeature = (idx: number, patch: Partial<FeatureCopy>) => {
    update({ features: content.features.map((f, i) => (i === idx ? { ...f, ...patch } : f)) });
  };

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>

        <Field label="Badge" value={content.badge} onChange={v => update({ badge: v })} onBlur={onBlur} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Headline line 1" value={content.headlineLine1} onChange={v => update({ headlineLine1: v })} onBlur={onBlur} />
          <Field label="Headline line 2" value={content.headlineLine2} onChange={v => update({ headlineLine2: v })} onBlur={onBlur} />
        </div>
        <Field label="Subheadline" value={content.subheadline} onChange={v => update({ subheadline: v })} onBlur={onBlur} multiline />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Eyebrow" value={content.eyebrow} onChange={v => update({ eyebrow: v })} onBlur={onBlur} />
          <Field label="Heading" value={content.heading} onChange={v => update({ heading: v })} onBlur={onBlur} />
        </div>
        <Field label="Primary button label" value={content.primaryCtaLabel} onChange={v => update({ primaryCtaLabel: v })} onBlur={onBlur} />

        <p className="text-[10px] text-slate-300">{saving ? "Saving..." : saved ? "Saved" : ""}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Feature cards</p>
        <div className="space-y-4">
          {content.features.map((f, idx) => (
            <div key={f.slug} className="p-4 bg-slate-50 rounded-2xl space-y-2">
              <p className="text-[10px] font-mono text-slate-300">{f.slug}</p>
              <Field label="Title" value={f.title} onChange={v => updateFeature(idx, { title: v })} onBlur={onBlur} />
              <Field label="Body" value={f.body} onChange={v => updateFeature(idx, { body: v })} onBlur={onBlur} multiline />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FeatureDetailEditor({
  label, content, saving, saved, onChange, onBlur,
}: {
  label: string;
  content: FeatureDetailCopy;
  saving: boolean;
  saved: boolean;
  onChange: (next: FeatureDetailCopy) => void;
  onBlur: () => void;
}) {
  const update = (patch: Partial<FeatureDetailCopy>) => onChange({ ...content, ...patch });
  const updateSection = (idx: number, patch: Partial<FeatureDetailSection>) => {
    update({ sections: content.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  };
  const updateSectionParagraph = (sectionIdx: number, paragraphIdx: number, value: string) => {
    const section = content.sections[sectionIdx];
    const body = section.body.map((p, i) => (i === paragraphIdx ? value : p));
    updateSection(sectionIdx, { body });
  };

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>

        <Field label="Badge text" value={content.badgeText} onChange={v => update({ badgeText: v })} onBlur={onBlur} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Headline line 1" value={content.headlineLine1} onChange={v => update({ headlineLine1: v })} onBlur={onBlur} />
          <Field label="Headline line 2" value={content.headlineLine2} onChange={v => update({ headlineLine2: v })} onBlur={onBlur} />
        </div>
        <Field label="Subheadline" value={content.subheadline} onChange={v => update({ subheadline: v })} onBlur={onBlur} multiline />

        <p className="text-[10px] text-slate-300">{saving ? "Saving..." : saved ? "Saved" : ""}</p>
      </div>

      {content.sections.map((section, sIdx) => (
        <div key={section.key} className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
          <p className="text-[10px] font-mono text-slate-300">{section.key}</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Eyebrow" value={section.eyebrow} onChange={v => updateSection(sIdx, { eyebrow: v })} onBlur={onBlur} />
            <Field label="Title" value={section.title} onChange={v => updateSection(sIdx, { title: v })} onBlur={onBlur} />
          </div>
          {section.body.map((paragraph, pIdx) => (
            <Field
              key={pIdx}
              label={section.body.length > 1 ? `Paragraph ${pIdx + 1}` : "Paragraph"}
              value={paragraph}
              onChange={v => updateSectionParagraph(sIdx, pIdx, v)}
              onBlur={onBlur}
              multiline
            />
          ))}
        </div>
      ))}
    </>
  );
}

function Field({
  label, value, onChange, onBlur, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          rows={3}
          className="w-full px-4 py-2 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
        />
      )}
    </label>
  );
}
