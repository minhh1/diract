// components/admin/GmailLegacyLabelCleanupPanel.tsx
// Admin-triggered, one-off cleanup for the historical "Filed Emails/*"
// label scheme this company used before switching to the current
// "<parentLabel>/<matterNumber> — <project name> [CODE]" one (see
// supabase/functions/gmail-legacy-label-cleanup/index.ts's own doc
// comment) -- the old labels were never merged into the new ones, so a
// matter that predates the switch shows BOTH on every old message.
// Dry-run first (GET /scan, no writes), then Clean up (POST /apply,
// looped per-user until nothing's left) only once the admin has seen the
// scope.
"use client";

import { useState } from "react";
import { Loader2, Wand2, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

const FUNCTIONS_URL = "https://txzzgtwrrokomiphairy.supabase.co/functions/v1/gmail-legacy-label-cleanup";

// The edge function is deployed with JWT verification off at the platform
// level (same as every other function in that folder) and does its own
// company-admin check instead -- see requireCompanyAdmin in
// supabase/functions/gmail-legacy-label-cleanup/index.ts -- so every call
// here needs the signed-in admin's own access token attached.
async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token || ""}` };
}

interface Pair {
  matterNumber: string;
  projectName: string;
  oldLabelName: string;
  newLabelName: string;
  messageCount: number;
}

interface ScanUser {
  userId: string;
  userName: string;
  pairs: Pair[];
}

interface Props {
  companyId: string;
}

export default function GmailLegacyLabelCleanupPanel({ companyId }: Props) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [users, setUsers] = useState<ScanUser[]>([]);
  const [totalPairs, setTotalPairs] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState<{ userName: string; processed: number } | null>(null);
  const [done, setDone] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    setScanned(false);
    setDone(false);
    const res = await fetch(`${FUNCTIONS_URL}/scan?companyId=${companyId}`, { headers: await authHeaders() });
    const data = await res.json();
    setUsers(data.users || []);
    setTotalPairs(data.totalPairs || 0);
    setTotalMessages(data.totalMessages || 0);
    setScanning(false);
    setScanned(true);
  };

  const handleCleanup = async () => {
    setCleaning(true);
    for (const user of users) {
      let remaining = user.pairs.length;
      while (remaining > 0) {
        setProgress({ userName: user.userName, processed: user.pairs.length - remaining });
        const res = await fetch(`${FUNCTIONS_URL}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ companyId, userId: user.userId }),
        });
        const data = await res.json();
        if (!data.ok) break; // stop this user on error, move to the next
        remaining = data.remaining ?? 0;
        if (data.processed === 0 && remaining > 0) break; // no progress -- avoid an infinite loop
      }
    }
    setProgress(null);
    setCleaning(false);
    setDone(true);
    handleScan(); // refresh the report to confirm what's left
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
        <p className="text-[12px] font-bold text-amber-800">One-off backlog cleanup</p>
        <p className="text-[11px] text-amber-700 mt-1.5 leading-relaxed">
          Merges old &quot;Filed Emails/&lt;matter number&gt; - ...&quot; labels (from before this company
          switched to the current labelling scheme) into the matching current label, then deletes the old
          one. Only touches a matter that has BOTH an old and a current label present in a given mailbox;
          nothing else is affected. Scan first to see the scope before cleaning anything up.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleScan}
          disabled={scanning || cleaning}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold bg-slate-900 text-white hover:bg-black disabled:opacity-40 transition-all"
        >
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {scanning ? "Scanning..." : "Scan for legacy labels"}
        </button>
        {scanned && totalPairs > 0 && (
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-all"
          >
            {cleaning ? <Loader2 size={13} className="animate-spin" /> : null}
            {cleaning ? `Cleaning up${progress ? `, ${progress.userName} (${progress.processed}/${totalPairs})` : "..."}` : `Clean up ${totalPairs} label${totalPairs === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {scanned && (
        <div>
          {totalPairs === 0 ? (
            <p className="text-[11px] text-emerald-600 font-bold">
              {done ? "All clear. Nothing left to clean up." : "No legacy labels found."}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500 font-bold mb-3">
                {totalPairs} legacy label{totalPairs === 1 ? "" : "s"} across {users.length} mailbox{users.length === 1 ? "" : "es"}
                {totalMessages > 0 ? `, ~${totalMessages} messages affected` : ""}
              </p>
              <div className="space-y-2">
                {users.map(user => {
                  const isExpanded = expandedUser === user.userId;
                  return (
                    <div key={user.userId} className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : user.userId)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                      >
                        <span className="text-[12px] font-bold text-slate-700">{user.userName}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold">{user.pairs.length} label{user.pairs.length === 1 ? "" : "s"}</span>
                          <ChevronDown size={13} className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-5 pb-4 space-y-2">
                          {user.pairs.map((p, i) => (
                            <div key={i} className="bg-slate-50 rounded-xl px-4 py-3">
                              <p className="text-[11px] font-bold text-slate-700">{p.projectName} ({p.matterNumber})</p>
                              <p className="text-[10px] text-slate-400 mt-1 truncate">Old: {p.oldLabelName}</p>
                              <p className="text-[10px] text-slate-400 truncate">New: {p.newLabelName}</p>
                              <p className="text-[10px] text-slate-500 mt-1">{p.messageCount} message{p.messageCount === 1 ? "" : "s"}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
