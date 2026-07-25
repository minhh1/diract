"use client";

// Wraps a system table's page (properties/entities/projects) so a "deleted"
// one (see CustomTableBuilder.tsx's handleDeleteSystemTable) can't still be
// browsed by direct URL/bookmark after it's been hidden from every nav
// surface -- otherwise "hide from user views" would only be true of the
// views that actually check for it, not the table's own page.
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useCompany } from "@/components/CompanyContext";

interface Props {
  slug: string;
  label: string;
  children: ReactNode;
}

export default function DeletedSystemTableGuard({ slug, label, children }: Props) {
  const { disabledSystemTables, loading } = useCompany();
  if (loading) return null;
  if (!disabledSystemTables[slug]) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <Trash2 size={32} className="text-slate-200" />
      <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">
        {label} has been deleted
      </p>
      <Link href="/dashboard/settings/trash" className="text-[11px] text-indigo-600 font-bold hover:underline">
        Restore it from Trash
      </Link>
    </div>
  );
}
