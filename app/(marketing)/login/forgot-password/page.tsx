// Requests a password-reset email via Supabase's resetPasswordForEmail --
// the link it sends goes through /auth/callback?next=/auth/reset-password
// (PKCE code exchange, same as every other auth redirect in this app) and
// lands on the actual "set a new password" form.
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Mail, Loader2, Fingerprint, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6 font-sans antialiased selection:bg-black selection:text-white">
      <div className="w-full max-w-[480px] bg-white rounded-[48px] p-10 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100">
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 bg-black rounded-[22px] flex items-center justify-center mb-5 shadow-2xl shadow-black/20">
            <Fingerprint className="text-white" size={28} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-slate-900">Diract</h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-3">Reset your password</p>
        </div>

        {error && (
          <div className="mb-6 px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] font-bold text-red-600 leading-relaxed flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {sent ? (
          <div className="px-5 py-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] font-bold text-emerald-700 leading-relaxed flex items-start gap-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            If an account exists for {email}, a password reset link has been sent -- check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type="email"
                placeholder="Corporate email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-4 rounded-full font-black uppercase text-xs tracking-widest shadow-xl shadow-black/10 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Send reset link <ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="w-full mt-8 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors tracking-widest text-center"
        >
          <ArrowLeft size={12} /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
