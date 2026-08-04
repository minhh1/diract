// Shared layout pieces for every feature deep-dive page under
// app/(marketing)/features/[slug] -- kept in one place so ~18 pages don't
// each hand-roll the same hero/section chrome.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function DetailHero({
  badgeIcon: Icon, badgeText, badgeClass, headlineLines, accentClass, subheadline,
}: {
  badgeIcon: LucideIcon;
  badgeText: string;
  badgeClass: string;
  headlineLines: [string, string];
  accentClass: string;
  subheadline: string;
}) {
  return (
    <>
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-full text-[11px] font-medium mb-8 ${badgeClass}`}>
        <Icon size={12} /> {badgeText}
      </div>
      <h1 className="text-4xl md:text-5xl font-light tracking-tight text-slate-900 mb-6 leading-[1.05]">
        {headlineLines[0]}<br /><span className={accentClass}>{headlineLines[1]}</span>
      </h1>
      <p className="text-lg text-slate-500 font-light max-w-2xl leading-relaxed">{subheadline}</p>
    </>
  );
}

export function Section({
  eyebrow, eyebrowClass = "text-indigo-400", title, children,
}: {
  eyebrow: string;
  eyebrowClass?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-8 py-14 border-t border-slate-100">
      <div>
        <p className={`text-[11px] font-bold ${eyebrowClass} uppercase tracking-widest mb-2`}>{eyebrow}</p>
        <h2 className="text-2xl font-medium text-slate-900">{title}</h2>
      </div>
      <div>{children}</div>
    </div>
  );
}
