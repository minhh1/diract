// app/login/page.tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { ensureStaffEntity } from "@/lib/services/staffEntityService";
import BrandMark from "@/components/marketing/BrandMark";
import { useTurnstileToken } from "@/components/marketing/TurnstileWidget";
import {
  COUNTRIES, COUNTRY_IDENTIFIERS, validateIdentifiers, identifiersToRpcParams,
  type CountryCode, type IdentifierValues,
} from "@/lib/companyIdentifiers";
import {
  Lock, Mail, Loader2, Globe, ArrowRight,
  Eye, EyeOff, CheckCircle2, Building2, AlertCircle
} from "lucide-react";

const VALUE_PROPS = [
  "Build the tables and workflow your business runs on",
  "Send invoices, texts, and emails straight from your workflow",
  "Manage multiple companies under one login",
];

type AuthMode = "login" | "register";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('token');
  // Where to send the user after a successful sign-in -- e.g. back to the
  // public task page they were trying to view. Only relative paths are
  // honoured, so this can't be abused as an open redirect.
  const redirectParam = searchParams.get('redirect');
  const postLoginPath = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
    ? redirectParam
    : '/dashboard/quick-glance';

  const [mode, setMode] = useState<AuthMode>(inviteToken ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState<CountryCode>("AU");
  const [identifiers, setIdentifiers] = useState<IdentifierValues>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Set alongside `error` only for the "this email is already registered"
  // case (see register_company_and_profile's error_code: 'duplicate_email'
  // -- supabase/migrations/20260806030000_register_company_duplicate_email_message.sql)
  // so the error banner can offer switching to the login form instead of
  // just showing the message.
  const [duplicateEmail, setDuplicateEmail] = useState(false);

  // SessionHealthBanner sends people here (after force-signing them out)
  // when their refresh token dies while idle -- show why they landed back
  // on login instead of leaving it unexplained.
  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      setError("Your session expired. Please sign in again.");
    }
    // app/auth/callback/route.ts sends people here when it couldn't
    // exchange an email confirmation (or invite/reset) link for a session
    // -- e.g. the link's single-use code was already consumed (a mail
    // provider's own link-scanning/prefetch can do this before the person
    // actually clicks it) or was opened somewhere the original PKCE
    // request isn't available. Their email is very likely already
    // confirmed at this point regardless -- signing in below with their
    // password works fine, so say that plainly instead of leaving them
    // wondering why the link "did nothing" (previously: no message at all).
    if (searchParams.get('error') === 'auth_failed') {
      setError("We couldn't complete that automatically, but your email is confirmed -- please sign in below.");
    }
  }, [searchParams]);

  // Token state
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenData, setTokenData] = useState<{
    id: string;
    company_id: string | null;
    company_name: string | null;
    note: string | null;
    expires_at: string | null;
    used_at: string | null;
    default_team_id: string | null;
    role: string;
  } | null>(null);

  // Is this an invite to join an existing company (vs creating a new one)?
  const isJoinInvite = !!inviteToken && !!tokenData?.company_id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // If logged in with a token, handle joining the company
        if (inviteToken) {
          handleTokenJoin();
        } else {
          router.replace(postLoginPath);
        }
      }
    });
  }, [router]);

  // Validate token on load
  useEffect(() => {
    if (!inviteToken) return;
    validateToken();
  }, [inviteToken]);

  const validateToken = async () => {
    const { data, error } = await supabase
      .rpc('validate_registration_token', { p_token: inviteToken! })
      .single() as { data: {
        id: string; company_id: string | null; company_name: string | null; note: string | null;
        expires_at: string | null; used_at: string | null; default_team_id: string | null; role: string;
      } | null; error: unknown };

    if (error || !data) {
      setTokenValid(false);
      return;
    }

    const isExpired = data.expires_at
      ? new Date(data.expires_at) < new Date()
      : false;
    const isUsed = !!data.used_at;

    if (isExpired || isUsed) {
      setTokenValid(false);
      setTokenData(null);
      return;
    }

    setTokenValid(true);
    setTokenData({
      id: data.id,
      company_id: data.company_id,
      company_name: data.company_name || null,
      note: data.note,
      expires_at: data.expires_at,
      used_at: data.used_at,
      default_team_id: data.default_team_id,
      role: data.role || 'operator',
    });

    // If joining existing company, default to login mode
    if (data.company_id) {
      setMode("login");
    } else {
      setMode("register");
    }
  };

  // Handle joining an existing company (called when already logged in with token).
  // Goes through /api/join-company (service role) rather than writing
  // team_members/registration_tokens directly -- both have admin-only RLS
  // write policies that a brand-new operator-role invitee can't satisfy
  // with their own session yet. See joinCompanyWithToken's header comment.
  const handleTokenJoin = async () => {
    if (!inviteToken || !tokenData?.company_id) {
      router.replace(postLoginPath);
      return;
    }

    try {
      await fetch('/api/join-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken }),
      });
      router.replace(postLoginPath);
    } catch {
      router.replace(postLoginPath);
    }
  };

  const clearMessages = () => { setError(null); setSuccess(null); setDuplicateEmail(false); };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    clearMessages();
    // Store invite token / post-login destination in cookies so the
    // callback route can read them after the OAuth round trip.
    if (inviteToken) {
      document.cookie = `invite_token=${inviteToken}; path=/; max-age=600; SameSite=Lax`;
    }
    if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
      document.cookie = `post_login_redirect=${encodeURIComponent(redirectParam)}; path=/; max-age=600; SameSite=Lax`;
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  };

  // ── Login -- also handles joining existing company with token ──────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (inviteToken && tokenValid === false) {
      setError("This invitation link is invalid or has already been used.");
      return;
    }

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

    // Tells components/AppLoader.tsx this is a real sign-in, not just a
    // revisit with a still-valid session -- see its own comment on why that
    // distinction matters (skips its warm-return-visit shortcut for one
    // load, so the splash actually shows here even if a stale cache from
    // before is sitting in localStorage).
    document.cookie = "nk_just_logged_in=1; path=/; max-age=60; SameSite=Lax";

    // If there's a valid company invite token, join that company via
    // /api/join-company (service role) -- see handleTokenJoin's comment.
    if (inviteToken && tokenValid && tokenData?.company_id) {
      try {
        const res = await fetch('/api/join-company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          console.error('Token join error:', json?.error);
        }
      } catch (err) {
        console.error('Token join error:', err);
        // Don't block login even if join fails
      }
    }

    router.replace(postLoginPath);
  };

  // ── Register -- creates new company OR joins existing via token ────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (inviteToken && tokenValid === false) {
      setError("This invitation link is invalid or has already been used.");
      return;
    }

    // If joining existing company, just need email + password
    if (!isJoinInvite) {
      if (!companyName.trim()) { setError("Company name is required."); return; }
    }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!isJoinInvite) {
      const identifierError = validateIdentifiers(country, identifiers);
      if (identifierError) { setError(identifierError); return; }
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || email.split('@')[0] },
          emailRedirectTo: inviteToken
            ? `${window.location.origin}/auth/callback?token=${inviteToken}`
            : `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        // Supabase Auth's own message for this case ("User already
        // registered") is already clean text, unlike the raw Postgres
        // constraint error the RPC below can throw for the same underlying
        // situation -- still worth the same "log in instead" treatment
        // rather than just a dead-end error.
        if (/already registered|already exists/i.test(authError.message)) {
          setError("An account with this email already exists.");
          setDuplicateEmail(true);
          setLoading(false);
          return;
        }
        throw new Error(authError.message);
      }
      if (!authData.user) throw new Error("User creation failed.");

      const userId = authData.user.id;

      if (isJoinInvite && tokenData?.company_id) {
        // ── Join existing company ──────────────────────────────
        // Create profile first -- /api/join-company only updates
        // active_company_id on an existing profile, it doesn't create one.
        await supabase.from('profiles').upsert({
          id: userId,
          full_name: fullName || email.split('@')[0],
          email,
          active_company_id: tokenData.company_id,
          is_admin: false,
          is_active: true,
        }, { onConflict: 'id' });

        // Membership + team assignment + marking the token used all go
        // through /api/join-company (service role) -- see
        // handleTokenJoin's comment for why the raw writes this used to do
        // silently failed for operator-role invites.
        if (inviteToken) {
          const res = await fetch('/api/join-company', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: inviteToken }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => null);
            console.error('Token join error:', json?.error);
          }
        }

      } else {
        // ── Create new company (original flow) ─────────────────
        // register_company_and_profile never accepted a p_invite_token
        // param -- passing one made PostgREST unable to match any function
        // overload at all, silently breaking every fresh self-signup with
        // "Could not find the function ... in the schema cache". See
        // supabase/migrations/20260808050000_register_company_country_identifiers.sql
        // for its current real signature.
        const { data: result, error: rpcError } = await supabase.rpc(
          'register_company_and_profile',
          {
            p_user_id: userId,
            p_full_name: fullName || email.split('@')[0],
            p_email: email,
            p_company_name: companyName.trim(),
            ...identifiersToRpcParams(country, identifiers),
          }
        );

        if (rpcError) throw new Error(`Registration failed: ${rpcError.message}`);
        if (result && !result.success) {
          // Handled separately from the generic throw below (rather than
          // string-matching the raw Postgres error in the catch block) --
          // see the RPC's own comment on why this needs to be a distinct,
          // stable error_code rather than parsing SQLERRM text.
          if (result.error_code === 'duplicate_email') {
            setError("An account with this email already exists.");
            setDuplicateEmail(true);
            setLoading(false);
            return;
          }
          throw new Error(result.error || 'Registration failed');
        }

        // register_company_and_profile's own return shape isn't relied on
        // elsewhere in this file -- reading the company id back off the
        // profile it just set avoids assuming one.
        const { data: newProfile } = await supabase.from('profiles').select('active_company_id').eq('id', userId).maybeSingle();
        if (newProfile?.active_company_id) await ensureStaffEntity(supabase, newProfile.active_company_id, userId);
      }

      const needsConfirmation = !authData.session;
      if (needsConfirmation) {
        setSuccess("Account created! Check your inbox and confirm your email to get started.");
        setLoading(false);
      } else {
        document.cookie = "nk_just_logged_in=1; path=/; max-age=60; SameSite=Lax";
        router.replace(postLoginPath);
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
    setCompanyName(''); setCountry('AU'); setIdentifiers({});
  };

  return (
    <div className="flex min-h-screen bg-stone-50 font-sans antialiased select-text">

      {/* Brand panel -- hidden below lg, this is the Canva-style split login */}
      <div className="hidden lg:flex lg:w-[44%] relative bg-gradient-to-br from-indigo-600 to-violet-700 text-white flex-col justify-between p-14 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center">
            <BrandMark size={22} />
          </div>
          <span className="font-medium tracking-tight text-lg">Diract</span>
        </div>

        <div className="relative">
          <h2 className="text-3xl font-light tracking-tight leading-tight mb-8">
            Your process,<br />your CRM.
          </h2>
          <ul className="space-y-4">
            {VALUE_PROPS.map((v) => (
              <li key={v} className="flex items-start gap-3 text-[14px] text-indigo-100">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-white" />
                {v}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-indigo-200 uppercase tracking-[0.25em] font-medium">
          Diract • Configurable CRM
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[420px]"
      >

        {/* Branding (mobile only -- the split panel above covers this on lg+) */}
        <div className="text-center mb-10 lg:hidden">
          <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
            <BrandMark size={40} />
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-slate-900">Diract</h1>
        </div>

        <div className="hidden lg:block mb-10">
          <h1 className="text-2xl font-medium tracking-tight text-slate-900">
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-slate-400 text-[13px] mt-2">
            {mode === 'register'
              ? isJoinInvite ? `Join ${tokenData?.company_name || 'Company'}` : 'Set up your firm’s workspace'
              : isJoinInvite ? `Sign in to join ${tokenData?.company_name || 'Company'}` : 'Sign in to your workspace'
            }
          </p>
        </div>

        {/* Invite token status */}
        {inviteToken && (
          <div className={`mb-6 px-5 py-3.5 rounded-2xl text-[11px] font-bold flex items-center gap-2 ${
            tokenValid === false
              ? 'bg-red-50 border border-red-100 text-red-600'
              : tokenValid === true
              ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
              : 'bg-slate-50 border border-slate-100 text-slate-400'
          }`}>
            {tokenValid === null
              ? <Loader2 size={14} className="animate-spin" />
              : tokenValid
              ? <CheckCircle2 size={14} />
              : <AlertCircle size={14} />
            }
            {tokenValid === null
              ? 'Validating invitation...'
              : tokenValid
              ? isJoinInvite
                ? `You've been invited to join ${tokenData?.company_name || 'a company'}`
                : 'Valid invitation, complete registration below'
              : 'This invitation link is invalid or has already been used'
            }
          </div>
        )}

        {/* Note from inviter */}
        {tokenData?.note && tokenValid && (
          <p className="text-[12px] text-slate-400 italic text-center mb-6">
            "{tokenData.note}"
          </p>
        )}

        {/* Messages */}
        {error && (
          <div className="mb-6 px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] font-bold text-red-600 leading-relaxed flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              {error}
              {duplicateEmail && (
                <>
                  {" "}Is this you?{" "}
                  <button type="button" onClick={switchMode} className="underline hover:text-red-800 transition-colors">
                    Log in instead
                  </button>
                  .
                </>
              )}
            </span>
          </div>
        )}
        {success && (
          <div className="mb-6 px-5 py-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[11px] font-bold text-emerald-700 leading-relaxed flex items-start gap-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {success}
          </div>
        )}

        {/* Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading || tokenValid === false}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-full border border-slate-200 font-medium text-sm hover:bg-slate-50 transition-all mb-8 group disabled:opacity-50"
        >
          {googleLoading
            ? <Loader2 size={18} className="animate-spin text-slate-400" />
            : <Globe size={18} className="text-blue-500 group-hover:rotate-12 transition-transform" />
          }
          Continue with Google
        </button>

        {/* Divider */}
        <div className="relative mb-8 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100" />
          </div>
          <span className="relative bg-white px-4 text-[11px] font-medium text-slate-400 uppercase tracking-widest">
            Or continue with email
          </span>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {mode === 'register' && (
            <>
              <input
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={e => { setFullName(e.target.value); clearMessages(); }}
                className="w-full p-4 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
              />

              {/* Only show company fields if creating a new company */}
              {!isJoinInvite && (
                <div className="rounded-[28px] border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                    Company details
                  </p>
                  <div className="relative">
                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      required
                      type="text"
                      placeholder="Company name"
                      value={companyName}
                      onChange={e => { setCompanyName(e.target.value); clearMessages(); }}
                      className="w-full p-4 pl-12 rounded-full border border-slate-200 bg-white outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                    />
                  </div>
                  <select
                    value={country}
                    onChange={e => { setCountry(e.target.value as CountryCode); setIdentifiers({}); clearMessages(); }}
                    className="w-full p-4 rounded-full border border-slate-200 bg-white outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm appearance-none"
                  >
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                  {COUNTRY_IDENTIFIERS[country].length > 0 && (
                    <div className={`grid gap-3 ${COUNTRY_IDENTIFIERS[country].length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {COUNTRY_IDENTIFIERS[country].map(field => (
                        <input
                          key={field.key}
                          type="text"
                          placeholder={`${field.label} (optional)`}
                          value={identifiers[field.key] || ""}
                          onChange={e => { setIdentifiers(prev => ({ ...prev, [field.key]: e.target.value })); clearMessages(); }}
                          className="w-full p-4 rounded-full border border-slate-200 bg-white outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="relative">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              required
              type="email"
              placeholder="Corporate email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearMessages(); }}
              className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              required
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); clearMessages(); }}
              className="w-full p-4 pl-14 pr-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {mode === 'register' && (
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); clearMessages(); }}
                className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
              />
            </div>
          )}

          {mode === 'login' && (
            <div className="flex justify-end -mt-1">
              <a
                href="/login/forgot-password"
                className="text-[12px] font-medium text-slate-400 hover:text-indigo-600 transition-colors"
              >
                Forgot password?
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading || tokenValid === false}
            className="w-full bg-indigo-600 text-white py-4 rounded-full font-medium text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="animate-spin" size={18} />
              : <>
                  {mode === 'login'
                    ? isJoinInvite ? `Sign in & join ${tokenData?.company_name || 'company'}` : 'Sign in'
                    : isJoinInvite ? `Create account & join ${tokenData?.company_name || 'company'}` : 'Create account'
                  }
                  <ArrowRight size={16} />
                </>
            }
          </button>
        </form>

        {/* Toggle -- for invite links, allow switching between sign in and register */}
        <button
          onClick={switchMode}
          className="w-full mt-8 text-[13px] font-medium text-slate-400 hover:text-indigo-600 transition-colors text-center"
        >
          {mode === 'login'
            ? isJoinInvite
              ? "New to Diract? Create an account instead"
              : "New here? Create an account"
            : isJoinInvite
              ? "Already have an account? Sign in instead"
              : "Already have an account? Sign in"
          }
        </button>
      </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}