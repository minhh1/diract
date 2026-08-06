// components/legal/LegalPageShell.tsx
// Shared chrome for the Terms of Service and Privacy Policy pages: the back
// link, title and last-updated line. Deliberately plain, hardcoded light
// styling -- these pages live under app/(marketing), which never mounts
// ThemeProvider, so there's no dark: variant to write anyway.
import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPageShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-[11px] text-indigo-600 hover:underline mb-8 block">
          ← Back to Diract
        </Link>

        <h1 className="text-3xl font-light tracking-tight text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-400 mb-10">Diract · Last updated: {lastUpdated}</p>

        <div className="space-y-10">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-800 mb-2">{title}</h2>
      <div className="text-slate-600 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      <div className="text-slate-600 text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  );
}
