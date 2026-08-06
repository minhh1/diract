"use client";

// A dedicated onboarding flow for the law-firm-au audience page's "Start
// your firm's workspace" CTA, replacing what used to be a plain link
// straight to the generic /login form (defaulting to sign-IN mode, no
// less -- the worst possible landing spot for a brand-new prospect).
// Collects the same real fields app/(marketing)/login/page.tsx's register
// mode does (company name, ABN, ACN, full name, email, password), then
// creates the account through the same
// register_company_and_profile RPC, and additionally installs the real
// Law Firm marketplace template (supabase/template_law_firm_seed.sql,
// slug "law-firm") so the new workspace arrives with matters, trust
// accounting, and the precedent library already in place instead of an
// empty company. If email confirmation is required, the install happens
// server-side in app/auth/callback/route.ts once the confirmation link is
// clicked, via the install_template param on emailRedirectTo.
//
// A third step asks whether the firm uses Gmail or Outlook. There's no
// company-level "which provider" field anywhere in this app (both are
// always-available, independently-connected per-user integrations -- see
// app/(app)/dashboard/gmail/page.tsx and .../outlook/page.tsx), so the
// honest use of that answer is routing: once the workspace exists, send
// the user straight into the real OAuth-start route for whichever they
// picked (/api/gmail/auth or /api/outlook/auth, the same ones those
// pages' own "Connect" buttons use) instead of inventing a preference to
// persist.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { ensureStaffEntity } from "@/lib/services/staffEntityService";
import { isValidABN, isValidACN } from "@/lib/validation/entityValidation";
import BrandMark from "@/components/marketing/BrandMark";
import Link from "next/link";
import {
  Building2, Landmark, FileText, Mail, Inbox, Lock, Loader2, Eye, EyeOff,
  CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Check, Circle,
} from "lucide-react";

const VALUE_PROPS = [
  "Matters, time entries, and trust accounting in one place",
  "The Law Firm template installed automatically, precedent library included",
  "Connect Gmail or Outlook as the last step, no separate setup later",
];

type Step = "firm" | "account" | "email" | "working" | "confirm-email";
type EmailProvider = "gmail" | "outlook" | "skip";
const STEPS: Step[] = ["firm", "account", "email"];

interface WorkStep { label: string; done: boolean }

export default function LawFirmGetStartedPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("firm");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [firmName, setFirmName] = useState("");
  const [abn, setAbn] = useState("");
  const [acn, setAcn] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailProvider, setEmailProvider] = useState<EmailProvider | null>(null);

  const [workSteps, setWorkSteps] = useState<WorkStep[]>([
    { label: "Creating your account", done: false },
    { label: "Setting up your firm", done: false },
    { label: "Installing your Law Firm workspace", done: false },
  ]);
  const markDone = (i: number) => setWorkSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, done: true } : s)));

  const abnError = abn.trim() && !isValidABN(abn.trim()) ? "Not a valid ABN" : null;
  const acnError = acn.trim() && !isValidACN(acn.trim()) ? "Not a valid ACN" : null;

  const continueFromFirm = () => {
    setError(null);
    if (!firmName.trim()) { setError("Firm name is required."); return; }
    if (abnError) { setError(abnError); return; }
    if (acnError) { setError(acnError); return; }
    setStep("account");
  };

  const continueFromAccount = () => {
    setError(null);
    if (!fullName.trim()) { setError("Your name is required."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setStep("email");
  };

  const createWorkspace = async () => {
    setError(null);
    setLoading(true);
    setStep("working");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback?install_template=law-firm`,
        },
      });
      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("Account creation failed.");
      markDone(0);

      const userId = authData.user.id;
      // No p_invite_token here -- the real function (confirmed against the
      // live database; it isn't tracked in any migration in this repo)
      // never accepted one. See the matching fix in
      // app/(marketing)/login/page.tsx's own call site.
      const { data: result, error: rpcError } = await supabase.rpc("register_company_and_profile", {
        p_user_id: userId,
        p_full_name: fullName,
        p_email: email,
        p_company_name: firmName.trim(),
        p_abn: abn.trim() || null,
        p_acn: acn.trim() || null,
      });
      if (rpcError) throw new Error(`Registration failed: ${rpcError.message}`);
      if (result && !result.success) throw new Error(result.error || "Registration failed");
      markDone(1);

      const needsConfirmation = !authData.session;
      if (needsConfirmation) {
        setStep("confirm-email");
        setLoading(false);
        return;
      }

      const { data: newProfile } = await supabase.from("profiles").select("active_company_id").eq("id", userId).maybeSingle();
      if (newProfile?.active_company_id) {
        await ensureStaffEntity(supabase, newProfile.active_company_id, userId);
        // register_company_and_profile never sets company_type -- without
        // this, QuickGlanceDashboard.tsx bounces a brand-new law firm
        // straight to /dashboard/properties (it only renders for 'Law Firm'
        // or 'Property Developer'), confirmed live during testing.
        await supabase.from("companies").update({ company_type: "Law Firm" }).eq("id", newProfile.active_company_id);
        try {
          const installRes = await fetch("/api/templates/law-firm/install", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resolutions: {}, installDashboards: true }),
          });
          if (!installRes.ok) {
            const body = await installRes.json().catch(() => ({}));
            console.error("Law Firm template install failed:", body.error || installRes.status);
          }
        } catch (err) {
          console.error("Law Firm template install failed:", err);
        }
      }
      markDone(2);

      document.cookie = "nk_just_logged_in=1; path=/; max-age=60; SameSite=Lax";
      // /api/gmail/auth and /api/outlook/auth are the same OAuth-start
      // routes app/(app)/dashboard/gmail/page.tsx and .../outlook/page.tsx
      // link their own "Connect" buttons to -- a full navigation (not
      // router.replace) since they redirect straight to Google/Microsoft's
      // consent screen, not to another page in this app's route tree.
      if (emailProvider === "gmail") {
        window.location.href = "/api/gmail/auth";
      } else if (emailProvider === "outlook") {
        window.location.href = "/api/outlook/auth";
      } else {
        router.replace("/dashboard/quick-glance");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
      setStep("account");
    }
  };

  return (
    <div className="flex min-h-screen bg-stone-50 font-sans antialiased select-text">
      {/* Brand panel */}
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
            Your firm's workspace,<br />ready from the first login.
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
          Diract • Built for Australian law firms
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          <div className="text-center mb-10 lg:hidden">
            <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
              <BrandMark size={40} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-slate-900">Diract</h1>
          </div>

          {(step === "firm" || step === "account" || step === "email") && (
            <>
              <div className="flex items-center gap-2 mb-8">
                {STEPS.map((s, i) => (
                  <div key={s} className={`h-1.5 flex-1 rounded-full ${
                    i <= STEPS.indexOf(step) ? "bg-indigo-600" : "bg-slate-100"
                  }`} />
                ))}
              </div>
              <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2">
                Step {STEPS.indexOf(step) + 1} of {STEPS.length}
              </p>
            </>
          )}

          {error && (
            <div className="mb-6 px-5 py-3.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] font-bold text-red-600 leading-relaxed flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === "firm" && (
              <motion.div key="firm" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-medium tracking-tight text-slate-900 mb-2">Tell us about your firm</h1>
                <p className="text-slate-400 text-[13px] mb-8">ABN and ACN are optional.</p>

                <div className="space-y-4">
                  <div className="relative">
                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      required
                      type="text"
                      placeholder="Firm name"
                      value={firmName}
                      onChange={(e) => { setFirmName(e.target.value); setError(null); }}
                      className="w-full p-4 pl-12 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        placeholder="ABN (optional)"
                        value={abn}
                        onChange={(e) => { setAbn(e.target.value); setError(null); }}
                        className="w-full p-4 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                      />
                      {abn.trim() && (
                        <p className={`text-[10px] font-bold mt-1.5 ml-4 flex items-center gap-1 ${abnError ? "text-red-500" : "text-emerald-600"}`}>
                          {abnError ? <AlertCircle size={10} /> : <Check size={10} />} {abnError || "Valid ABN"}
                        </p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="ACN (optional)"
                        value={acn}
                        onChange={(e) => { setAcn(e.target.value); setError(null); }}
                        className="w-full p-4 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                      />
                      {acn.trim() && (
                        <p className={`text-[10px] font-bold mt-1.5 ml-4 flex items-center gap-1 ${acnError ? "text-red-500" : "text-emerald-600"}`}>
                          {acnError ? <AlertCircle size={10} /> : <Check size={10} />} {acnError || "Valid ACN"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={continueFromFirm}
                  className="w-full mt-8 bg-indigo-600 text-white py-4 rounded-full font-medium text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight size={16} />
                </button>

                <Link href="/for/law-firm-au" className="w-full mt-6 text-[13px] font-medium text-slate-400 hover:text-indigo-600 transition-colors text-center flex items-center justify-center gap-1.5">
                  <ArrowLeft size={13} /> Back
                </Link>
              </motion.div>
            )}

            {step === "account" && (
              <motion.div key="account" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-medium tracking-tight text-slate-900 mb-2">Create your account</h1>
                <p className="text-slate-400 text-[13px] mb-8">You'll be the first admin for {firmName || "your firm"}.</p>

                <div className="space-y-4">
                  <input
                    required
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(null); }}
                    className="w-full p-4 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                  />
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                      required
                      type="email"
                      placeholder="Work email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
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
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      className="w-full p-4 pl-14 pr-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                    />
                    <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                      className="w-full p-4 pl-14 rounded-full border border-slate-200 bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={continueFromAccount}
                  className="w-full mt-8 bg-indigo-600 text-white py-4 rounded-full font-medium text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight size={16} />
                </button>

                <button onClick={() => setStep("firm")} className="w-full mt-6 text-[13px] font-medium text-slate-400 hover:text-indigo-600 transition-colors text-center flex items-center justify-center gap-1.5">
                  <ArrowLeft size={13} /> Back
                </button>

                <p className="text-center text-[12px] text-slate-400 mt-8">
                  Already have an account? <Link href="/login" className="font-medium text-indigo-600">Sign in</Link>
                </p>
              </motion.div>
            )}

            {step === "email" && (
              <motion.div key="email" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-medium tracking-tight text-slate-900 mb-2">Do you use Gmail or Outlook?</h1>
                <p className="text-slate-400 text-[13px] mb-8">
                  We'll take you straight to connect it once your workspace is ready. You can always do this later from Settings instead.
                </p>

                <div className="space-y-3">
                  {([
                    { value: "gmail" as const, icon: Mail, label: "Gmail", body: "Connect with Google after setup" },
                    { value: "outlook" as const, icon: Inbox, label: "Outlook", body: "Connect with Microsoft after setup" },
                    { value: "skip" as const, icon: ArrowRight, label: "I'll connect later", body: "Skip this for now" },
                  ]).map((opt) => {
                    const selected = emailProvider === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEmailProvider(opt.value)}
                        className={`w-full flex items-center gap-4 p-4 rounded-[24px] border text-left transition-all ${
                          selected ? "border-indigo-300 bg-indigo-50/60 ring-4 ring-indigo-100" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${selected ? "bg-indigo-600 text-white" : "bg-white text-slate-400"}`}>
                          <Icon size={17} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-800">{opt.label}</p>
                          <p className="text-[11px] text-slate-400">{opt.body}</p>
                        </div>
                        {selected && <Check size={16} className="text-indigo-600 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={createWorkspace}
                  disabled={loading || !emailProvider}
                  className="w-full mt-8 bg-indigo-600 text-white py-4 rounded-full font-medium text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <>Create workspace <ArrowRight size={16} /></>}
                </button>

                <button onClick={() => setStep("account")} className="w-full mt-6 text-[13px] font-medium text-slate-400 hover:text-indigo-600 transition-colors text-center flex items-center justify-center gap-1.5">
                  <ArrowLeft size={13} /> Back
                </button>
              </motion.div>
            )}

            {step === "working" && (
              <motion.div key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10">
                <h1 className="text-2xl font-medium tracking-tight text-slate-900 mb-8">Setting up your workspace</h1>
                <div className="space-y-4">
                  {workSteps.map((s) => (
                    <div key={s.label} className="flex items-center gap-3">
                      {s.done ? <Check size={16} className="text-emerald-500 shrink-0" /> : <Circle size={16} className="text-slate-200 shrink-0" />}
                      <span className={`text-sm ${s.done ? "text-slate-700 font-medium" : "text-slate-400"}`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {step === "confirm-email" && (
              <motion.div key="confirm-email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
                  <Mail size={24} className="text-emerald-600" />
                </div>
                <h1 className="text-2xl font-medium tracking-tight text-slate-900 mb-3">Check your inbox</h1>
                <p className="text-slate-500 text-[14px] leading-relaxed mb-6">
                  We sent a confirmation link to <span className="font-medium text-slate-700">{email}</span>. Once you confirm,
                  {" "}{firmName || "your firm"}'s workspace will already have matters, trust accounting, and the precedent
                  library set up and waiting. You can connect {emailProvider === "outlook" ? "Outlook" : emailProvider === "gmail" ? "Gmail" : "Gmail or Outlook"} from Settings once you're signed in.
                </p>
                <Link href="/login" className="text-[13px] font-medium text-indigo-600 inline-flex items-center gap-1.5">
                  Back to sign in <ArrowRight size={14} />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
