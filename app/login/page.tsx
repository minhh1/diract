// app/login/page.tsx (or wherever your login page lives)
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Lock, Mail, Loader2, Globe, Fingerprint, ArrowRight,
  Eye, EyeOff, CheckCircle2, Building2
} from "lucide-react";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Registration extra fields
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [abn, setAbn] = useState("");
  const [acn, setAcn] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard/properties");
    });
  }, [router]);

  const clearMessages = () => { setError(null); setSuccess(null); };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    clearMessages();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setError("Please confirm your email before signing in.");
      } else if (error.message.toLowerCase().includes('invalid login')) {
        setError("Incorrect email or password.");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    if (!data.session) {
      setError("Login succeeded but no session was created. Please try again.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard/properties");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!companyName.trim()) { setError("Company name is required."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    // Client-side ABN/ACN validation (if provided)
    if (abn.trim() && !isValidABN(abn.trim())) {
      setError("ABN is not valid. Please check and try again.");
      return;
    }
    if (acn.trim() && !isValidACN(acn.trim())) {
      setError("ACN is not valid. Please check and try again.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create the auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || email.split('@')[0] },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("User creation failed.");

      // 2. Create the company as pending
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyName.trim(),
          abn: abn.trim() || null,
          acn: acn.trim() || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (companyError) throw new Error(`Could not create company: ${companyError.message}`);

      // 3. Create the profile linking user to company with company_admin role
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          full_name: fullName || email.split('@')[0],
          email,
          active_company_id: company.id,  // renamed column
          role: 'company_admin',
          is_active: true,
        });

      if (profileError) throw new Error(`Could not create profile: ${profileError.message}`);
      // The trigger handles membership insertion automatically,
      // but insert explicitly too as a belt-and-suspenders guarantee:
      await supabase.from('company_memberships').insert({
        user_id: authData.user.id,
        company_id: company.id,
        role: 'company_admin',
      });


      // 4. Done — check if email confirmation is required
      const needsConfirmation = !authData.session;

      if (needsConfirmation) {
        setSuccess("Account created! Check your inbox and confirm your email to get started.");
        setLoading(false);
      } else {
        router.replace("/dashboard/properties");
      }
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    clearMessages();
    setPassword(''); setConfirmPassword('');
    setCompanyName(''); setAbn(''); setAcn('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans antialiased selection:bg-black selection:text-white">
      <div className="w-full max-w-[480px] bg-white rounded-[48px] p-10 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 animate-in fade-in duration-700">

        {/* Branding */}
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 bg-black rounded-[22px] flex items-center justify-center mb-5 shadow-2xl shadow-black/20">
            <Fingerprint className="text-white" size={28} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-slate-900">niksen-flow</h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-3">
            {mode === 'register' ? 'New Company Enrolment' : 'Enterprise Secure Access'}
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] font-bold text-red-600 leading-relaxed">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 px-5 py-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] font-bold text-emerald-700 leading-relaxed flex items-start gap-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            {success}
          </div>
        )}

        {/* Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-full border border-slate-200 font-bold text-sm hover:bg-slate-50 transition-all mb-8 group disabled:opacity-50"
        >
          {googleLoading
            ? <Loader2 size={18} className="animate-spin text-slate-400" />
            : <Globe size={18} className="text-blue-500 group-hover:rotate-12 transition-transform" />
          }
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="relative mb-8 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <span className="relative bg-white px-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Or continue with email
          </span>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">

          {/* Registration-only fields */}
          {mode === 'register' && (
            <>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); clearMessages(); }}
                  className="w-full p-4 pl-5 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
                />
              </div>

              {/* Company section */}
              <div className="rounded-[28px] border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Company details</p>

                <div className="relative">
                  <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input
                    required
                    type="text"
                    placeholder="Company name"
                    value={companyName}
                    onChange={e => { setCompanyName(e.target.value); clearMessages(); }}
                    className="w-full p-4 pl-12 rounded-full border border-slate-200 bg-white outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="ABN (optional)"
                    value={abn}
                    onChange={e => { setAbn(e.target.value); clearMessages(); }}
                    className="w-full p-4 rounded-full border border-slate-200 bg-white outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
                  />
                  <input
                    type="text"
                    placeholder="ACN (optional)"
                    value={acn}
                    onChange={e => { setAcn(e.target.value); clearMessages(); }}
                    className="w-full p-4 rounded-full border border-slate-200 bg-white outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
                  />
                </div>
                <p className="text-[9px] text-slate-400 px-1">
                  ABN and ACN are optional but help with verification. Your company will be reviewed before full access is granted.
                </p>
              </div>
            </>
          )}

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              required
              type="email"
              placeholder="Corporate email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearMessages(); }}
              className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              required
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); clearMessages(); }}
              className="w-full p-4 pl-14 pr-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Confirm password — register only */}
          {mode === 'register' && (
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); clearMessages(); }}
                className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-black/5 font-bold text-sm transition-all"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full bg-black text-white py-4 rounded-full font-black uppercase text-xs tracking-widest shadow-xl shadow-black/10 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="animate-spin" size={18} />
              : <>{mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></>
            }
          </button>
        </form>

        {/* Toggle */}
        <button
          onClick={switchMode}
          className="w-full mt-8 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors tracking-widest text-center"
        >
          {mode === 'login'
            ? "New here? Create an account"
            : "Already have an account? Sign in"
          }
        </button>
      </div>

      <div className="fixed bottom-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.5em] pointer-events-none">
        Niksen Time Pty Ltd • Asset Management
      </div>
    </div>
  );
}

// ABN validation — modulus-89 algorithm
function isValidABN(abn: string): boolean {
  const cleaned = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = cleaned.split('').map(Number);
  digits[0] -= 1;
  return digits.reduce((sum, d, i) => sum + d * weights[i], 0) % 89 === 0;
}

// ACN validation — weighted modulus-10
function isValidACN(acn: string): boolean {
  const cleaned = acn.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  const total = cleaned.slice(0, 8).split('').reduce((sum, d, i) => sum + Number(d) * weights[i], 0);
  const remainder = total % 10;
  const expected = remainder === 0 ? 0 : 10 - remainder;
  return expected === Number(cleaned[8]);
}