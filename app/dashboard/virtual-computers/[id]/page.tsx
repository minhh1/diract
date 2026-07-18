// app/dashboard/virtual-computers/[id]/page.tsx
// Full-screen session view. The API layer (app/api/virtual-computers/[id]/*)
// guards that only the assigned member or an admin can reach this VM.
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import GuacamoleViewer from "@/components/virtualcomputers/GuacamoleViewer";
import VmStatusBadge from "@/components/virtualcomputers/VmStatusBadge";

interface VmStatus {
  id: string;
  status: string;
  errorMessage: string | null;
}

export default function VirtualComputerSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<VmStatus | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/virtual-computers/${id}/status`);
    if (!res.ok) {
      router.replace("/dashboard/virtual-computers");
      return;
    }
    const json = await res.json();
    setStatus(json);
  }, [id, router]);

  useEffect(() => {
    poll();
  }, [poll]);

  useEffect(() => {
    if (status?.status !== "provisioning") return;
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [status, poll]);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white shrink-0">
        <button onClick={() => router.push("/dashboard/virtual-computers")} className="p-1.5 text-slate-400 hover:text-slate-700">
          <ArrowLeft size={16} />
        </button>
        <p className="text-[13px] font-bold text-slate-800 flex-1">Virtual Computer</p>
        {status && <VmStatusBadge status={status.status} />}
      </div>

      <div className="flex-1 min-h-0">
        {!status ? null : status.status === "running" ? (
          <GuacamoleViewer vmId={id} />
        ) : status.status === "error" ? (
          <div className="flex items-center justify-center h-full text-[13px] text-red-600 bg-red-50 m-6 rounded-2xl p-6">
            {status.errorMessage || "Something went wrong provisioning this virtual computer."}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[13px] text-slate-400">
            Setting up your virtual computer... this can take a minute.
          </div>
        )}
      </div>
    </div>
  );
}
