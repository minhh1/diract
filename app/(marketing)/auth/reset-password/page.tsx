// Landed on after /auth/callback exchanges a recovery-link code for a
// session -- that session is enough for supabase.auth.updateUser({password})
// to work without re-entering the old password. If there's no session (link
// expired/already used, or this page was opened directly), sends back to
// forgot-password to request a fresh link.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, Loader2, Fingerprint, ArrowRight, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setCheckingSession(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.replace("/dashboard/projects");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans antialiased selection:bg-black selection:text-white">
      <div className="w-full max-w-[480px] bg-white rounded-[48px] p-10 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100">
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 bg-black rounded-[22px] flex items-center justify-center mb-5 shadow-2xl shadow-black/20">
            <Fingerprint className="text-white" size={28} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-slate-900">Diract</h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-3">Set a new password</p>
        </div>

        {checkingSession ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-300" size={24} /></div>
        ) : !hasSession ? (
          <div className="px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] font-bold text-red-600 leading-relaxed flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            This reset link is invalid or has expired. Request a new one from the{" "}
            <a href="/login/forgot-password" className="underline">forgot password page</a>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] font-bold text-red-600 leading-relaxed flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 pl-14 pr-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-4 rounded-full font-black uppercase text-xs tracking-widest shadow-xl shadow-black/10 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Update password <ArrowRight size={16} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
