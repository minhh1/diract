// components/virtualcomputers/GuacamoleViewer.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const GUACAMOLE_URL = process.env.NEXT_PUBLIC_GUACAMOLE_URL || "http://localhost:8080/guacamole";

export default function GuacamoleViewer({ vmId }: { vmId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/virtual-computers/${vmId}/session`, { method: "POST" });
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || "Could not start session");
        return;
      }
      setSrc(`${GUACAMOLE_URL}/#/client/${json.clientIdentifier}?token=${json.authToken}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [vmId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-red-600 bg-red-50 m-6 rounded-2xl p-6">
        {error}
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[13px] text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Connecting...
      </div>
    );
  }

  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms"
      allow="clipboard-read; clipboard-write"
      title="Virtual computer session"
    />
  );
}
