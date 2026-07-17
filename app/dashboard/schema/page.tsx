"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SchemaMap from "@/components/SchemaMap";

export default function SchemaMapPage() {
  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0 flex items-center gap-6">
        <Link href="/dashboard/settings" className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">Schema map</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">Tables and their relations</p>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-8">
        <SchemaMap />
      </main>
    </div>
  );
}
