"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Lock, Mail, Loader2, ArrowRight, Globe, Fingerprint } from "lucide-react";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

        const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
            // THIS MUST MATCH THE FILE WE JUST CREATED
            redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) alert(error.message);
        };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = isRegister 
      ? await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { full_name: email.split('@')[0] } }
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) alert(error.message);
    else window.location.href = "/dashboard/projects";
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans">
      <div className="w-full max-w-[440px] bg-white rounded-[48px] p-12 shadow-2xl border border-slate-100 animate-in fade-in duration-700">
        <div className="text-center mb-10">
          <div className="mx-auto w-12 h-12 bg-black rounded-2xl flex items-center justify-center mb-4 shadow-xl">
            <Fingerprint className="text-white" size={24} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-slate-900">niksen-flow</h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-3">
            {isRegister ? 'New Company Enrollment' : 'Enterprise Secure Access'}
          </p>
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-full border border-slate-200 font-bold text-sm hover:bg-slate-50 transition-all mb-6"
        >
          <Globe size={18} className="text-blue-500" /> Continue with Google
        </button>

        <div className="relative mb-8 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <span className="relative bg-white px-4 text-[10px] font-black text-slate-300 uppercase">Verification Strategy</span>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <input required type="email" placeholder="Corporate Email" className="w-full p-4 rounded-full border bg-slate-50 outline-none focus:ring-4 ring-black/5 font-bold text-sm" onChange={e => setEmail(e.target.value)} />
          <input required type="password" placeholder="Access Key" className="w-full p-4 rounded-full border bg-slate-50 outline-none focus:ring-4 ring-black/5 font-bold text-sm" onChange={e => setPassword(e.target.value)} />
          <button disabled={loading} className="w-full bg-black text-white py-5 rounded-full font-black uppercase text-xs tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center">
            {loading ? <Loader2 className="animate-spin" /> : (isRegister ? 'Create Account' : 'Authorize Entrance')}
          </button>
        </form>

        <button onClick={() => setIsRegister(!isRegister)} className="w-full mt-8 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors tracking-widest">
          {isRegister ? 'Already onboarded? Sign In' : 'New Subsidiary? Register Unit'}
        </button>
      </div>
    </div>
  );
}