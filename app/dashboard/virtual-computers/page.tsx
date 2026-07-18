// app/dashboard/virtual-computers/page.tsx
// Lists the virtual computer(s) assigned to the signed-in user. Creation,
// reassignment, and destruction are admin-only actions from Admin ->
// Virtual Computers -- there is no "launch your own VM" flow here.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import VmCard from "@/components/virtualcomputers/VmCard";

interface Vm {
  id: string;
  name: string;
  provider: string;
  protocol: string;
  status: string;
}

export default function VirtualComputersPage() {
  const [vms, setVms] = useState<Vm[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/virtual-computers/list");
    const json = await res.json();
    setVms(json.virtualComputers || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!vms.some((vm) => vm.status === "provisioning")) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [vms, load]);

  return (
    <div className="p-8 max-w-3xl mx-auto min-h-screen">
      <h1 className="text-xl font-bold text-slate-800 mb-1">Virtual Computers</h1>
      <p className="text-[13px] text-slate-400 mb-8">Remote desktops your admin has set up for you.</p>

      {loading ? (
        <p className="text-[11px] text-slate-400">Loading...</p>
      ) : vms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-slate-200 rounded-[32px]">
          <Monitor size={28} className="text-slate-300 mb-3" />
          <p className="text-[13px] text-slate-500">No virtual computer has been assigned to you yet.</p>
          <p className="text-[11px] text-slate-400 mt-1">Ask your admin to set one up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vms.map((vm) => (
            <VmCard key={vm.id} vm={vm} />
          ))}
        </div>
      )}
    </div>
  );
}
