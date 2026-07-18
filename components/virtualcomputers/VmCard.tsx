// components/virtualcomputers/VmCard.tsx
"use client";

import Link from "next/link";
import { Monitor } from "lucide-react";
import VmStatusBadge from "./VmStatusBadge";

interface Vm {
  id: string;
  name: string;
  protocol: string;
  status: string;
}

export default function VmCard({ vm }: { vm: Vm }) {
  return (
    <Link
      href={`/dashboard/virtual-computers/${vm.id}`}
      className="flex items-center gap-4 bg-white border border-slate-200 rounded-[32px] p-6 hover:border-indigo-200 transition-colors"
    >
      <div className="w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
        <Monitor size={18} className="text-indigo-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-slate-800 truncate">{vm.name}</p>
        <p className="text-[11px] text-slate-400 uppercase tracking-wide">{vm.protocol}</p>
      </div>
      <VmStatusBadge status={vm.status} />
    </Link>
  );
}
