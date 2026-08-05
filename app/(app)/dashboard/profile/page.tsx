"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  ArrowLeft, Loader2, Camera, Trash2, CheckCircle2, AlertCircle, User, PenSquare, Bell, KeyRound,
} from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/eventTypes";

export default function ProfilePage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || ""));
  }, []);

  useProgressBarWhile(profileLoading || !email);

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0 flex items-center gap-6">
        <Link href="/dashboard" className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">My Profile</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">Account settings</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-4 pb-20">
          {profileLoading || !email ? null : (
            <>
              <ProfileForm
                // Remount with fresh initial state if the signed-in user ever changes.
                key={profile?.id || "anon"}
                initialFullName={profile?.full_name || ""}
                initialAvatarUrl={profile?.avatar_url || null}
                email={email}
              />
              {profile?.id && <SecuritySection key={profile.id} userId={profile.id} />}
              {profile?.id && <SignoffSection key={profile.id} userId={profile.id} />}
              {profile?.id && <NotificationPreferencesSection key={profile.id} userId={profile.id} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileForm({ initialFullName, initialAvatarUrl, email }: {
  initialFullName: string;
  initialAvatarUrl: string | null;
  email: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const initials = (fullName || email).substring(0, 2).toUpperCase();

  const refreshProfile = () => queryClient.invalidateQueries({ queryKey: ["profile"] });

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarError(null);
    setAvatarUploading(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setAvatarUrl(data.avatar_url);
      refreshProfile();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove photo");
      setAvatarUrl(null);
      refreshProfile();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveName = async () => {
    setNameMessage(null);
    if (!fullName.trim()) { setNameMessage({ type: "error", text: "Name can't be empty" }); return; }
    setSavingName(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user?.id);
    setSavingName(false);
    if (error) { setNameMessage({ type: "error", text: error.message }); return; }
    setNameMessage({ type: "ok", text: "Name updated" });
    refreshProfile();
  };

  const handleChangeEmail = async () => {
    setEmailMessage(null);
    if (!newEmail.trim() || newEmail.trim() === email) {
      setEmailMessage({ type: "error", text: "Enter a different email address" });
      return;
    }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) { setEmailMessage({ type: "error", text: error.message }); return; }
    setEmailMessage({ type: "ok", text: "Confirmation links sent to your old and new email. Click both to finish the change." });
    setNewEmail("");
  };

  const handleChangePassword = async () => {
    setPasswordMessage(null);
    if (newPassword.length < 8) { setPasswordMessage({ type: "error", text: "Password must be at least 8 characters" }); return; }
    if (newPassword !== confirmPassword) { setPasswordMessage({ type: "error", text: "Passwords don't match" }); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { setPasswordMessage({ type: "error", text: error.message }); return; }
    setPasswordMessage({ type: "ok", text: "Password updated" });
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <>
      {/* ── AVATAR + NAME ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <div className="h-20 w-20 rounded-full bg-slate-900 flex items-center justify-center text-xl font-bold text-white uppercase overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
              ) : (
                initials || <User size={24} />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              title="Upload photo"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700 transition-all disabled:opacity-60"
            >
              {avatarUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarSelect} />
          </div>

          <div className="flex-1">
            <p className="text-[15px] font-medium text-slate-900">{fullName || "Unnamed"}</p>
            <p className="text-[12px] text-slate-400 mt-0.5">{email}</p>
            {avatarUrl && (
              <button
                onClick={handleAvatarRemove}
                disabled={avatarUploading}
                className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-60"
              >
                <Trash2 size={12} /> Remove photo
              </button>
            )}
            {avatarError && <p className="mt-2 text-[11px] text-red-500">{avatarError}</p>}
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full name</label>
          <div className="mt-2 flex items-center gap-3">
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all"
              placeholder="Your name"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || fullName.trim() === initialFullName}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default shrink-0"
            >
              {savingName ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
          {nameMessage && <MessageRow message={nameMessage} />}
        </div>
      </div>

      {/* ── EMAIL ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
        <h2 className="text-[15px] font-medium text-slate-900">Email address</h2>
        <p className="text-[12px] text-slate-400 mt-1">Currently <span className="font-medium text-slate-600">{email}</span></p>
        <div className="mt-4 flex items-center gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all"
            placeholder="New email address"
          />
          <button
            onClick={handleChangeEmail}
            disabled={savingEmail || !newEmail.trim()}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default shrink-0"
          >
            {savingEmail ? <Loader2 size={14} className="animate-spin" /> : "Change email"}
          </button>
        </div>
        {emailMessage && <MessageRow message={emailMessage} />}
      </div>

      {/* ── PASSWORD ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
        <h2 className="text-[15px] font-medium text-slate-900">Password</h2>
        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all"
            placeholder="New password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all"
            placeholder="Confirm new password"
          />
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default"
          >
            {savingPassword ? <Loader2 size={14} className="animate-spin" /> : "Update password"}
          </button>
        </div>
        {passwordMessage && <MessageRow message={passwordMessage} />}
      </div>
    </>
  );
}

// ── TWO-FACTOR AUTHENTICATION ───────────────────────────────────
// A real TOTP enrollment flow against Supabase Auth's own MFA API
// (supabase.auth.mfa.enroll/challengeAndVerify/unenroll) -- nothing here is
// simulated. The installed @supabase/auth-js (2.108.2, see GoTrueClient.js's
// own mfa().enroll()) already prepends `data:image/svg+xml;utf-8,` to
// data.totp.qr_code itself -- UNENCODED -- before handing it back, unlike
// older versions/its own doc comments, which describe a bare SVG document.
// Blindly re-prepending that same prefix here (an earlier version of this
// fix) double-wrapped it into garbage ("data:image/svg+xml;utf-8,data%3A...")
// that never renders. toQrDataUri() below strips the SDK's own prefix if
// present before percent-encoding the actual SVG and rebuilding the URI
// itself, so this keeps working whichever shape a future SDK version
// returns. The percent-encoding itself is still required regardless -- the
// SVG's fill="#..." colors and other reserved characters corrupt an
// unencoded data URI, which renders as a broken image in Safari/iOS in
// particular (other browsers are more forgiving, which is how the original,
// pre-SDK-change bug shipped unnoticed). This is where enrolling and later
// turning it off both actually happen.
const SVG_DATA_URI_PREFIX = "data:image/svg+xml;utf-8,";
function toQrDataUri(qrCode: string): string {
  const svg = qrCode.startsWith(SVG_DATA_URI_PREFIX) ? qrCode.slice(SVG_DATA_URI_PREFIX.length) : qrCode;
  return `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg)}`;
}
function SecuritySection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState<{ id: string } | null>(null);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const refresh = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactor(data?.totp?.[0] ? { id: data.totp[0].id } : null);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [userId]);

  const startEnroll = async () => {
    setMessage(null);
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Diract" });
    setBusy(false);
    if (error || !data) { setMessage({ type: "error", text: error?.message || "Could not start enrollment" }); return; }
    setEnrolling({ factorId: data.id, qrCode: toQrDataUri(data.totp.qr_code), secret: data.totp.secret });
  };

  const verifyEnroll = async () => {
    if (!enrolling) return;
    setMessage(null);
    if (!/^\d{6}$/.test(code.trim())) { setMessage({ type: "error", text: "Enter the 6-digit code from your app" }); return; }
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: code.trim() });
    setBusy(false);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setEnrolling(null);
    setCode("");
    setMessage({ type: "ok", text: "Two-factor authentication is on" });
    refresh();
  };

  const cancelEnroll = async () => {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setCode("");
    setMessage(null);
  };

  const remove = async () => {
    if (!factor) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setMessage({ type: "ok", text: "Two-factor authentication turned off" });
    refresh();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-emerald-600" />
        <h2 className="text-[15px] font-medium text-slate-900">Two-factor authentication</h2>
      </div>
      <p className="text-[12px] text-slate-400 mt-1">
        Add a code from an authenticator app, like Google Authenticator or 1Password, on top of your password.
      </p>

      {loading ? (
        <div className="mt-4 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
      ) : enrolling ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolling.qrCode} alt="Scan with your authenticator app" className="h-32 w-32 rounded-2xl border border-slate-200 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Scan this in your authenticator app, or enter the code manually.</p>
              <p className="mt-1 text-[12px] font-mono text-slate-700 break-all">{enrolling.secret}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="6-digit code"
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all"
            />
            <button onClick={verifyEnroll} disabled={busy} className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default shrink-0">
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
            </button>
          </div>
          <button onClick={cancelEnroll} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
        </div>
      ) : factor ? (
        <div className="mt-4 flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 rounded-2xl">
          <span className="flex items-center gap-2 text-[12px] font-medium text-emerald-700"><CheckCircle2 size={14} /> Turned on</span>
          <button onClick={remove} disabled={busy} className="px-4 py-2 bg-white text-slate-500 rounded-full text-[11px] font-bold hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-40 disabled:cursor-default">
            {busy ? <Loader2 size={12} className="animate-spin" /> : "Turn off"}
          </button>
        </div>
      ) : (
        <button onClick={startEnroll} disabled={busy} className="mt-4 px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default">
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Set up"}
        </button>
      )}
      {message && <MessageRow message={message} />}
    </div>
  );
}

// ── SIGNOFF DETAILS ──────────────────────────────────────────────
// What appears (Name in bold, then Position/Company Name/Contact Number/
// Contact Email) under this person's name when someone picks them as a
// signer on an issued Precedent document (see
// components/dashboard/tabs/PrecedentsTab.tsx, which links here when a
// selected staff member hasn't filled this in yet). Self-service: PUT
// /api/precedents/staff-signoffs always allows editing your own row (see
// that route's auth check), no admin needed.
function SignoffSection({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/precedents/staff-signoffs");
      const json = await res.json();
      const mine = (json.staff || []).find((s: any) => s.userId === userId);
      if (mine) {
        setName(mine.name || "");
        setPosition(mine.position || "");
        setCompanyName(mine.companyName || "");
        setContactNumber(mine.contactNumber || "");
        setContactEmail(mine.contactEmail || "");
      }
      setLoading(false);
    })();
  }, [userId]);

  const save = async () => {
    setMessage(null);
    if (!name.trim()) { setMessage({ type: "error", text: "Name is required" }); return; }
    setSaving(true);
    const res = await fetch("/api/precedents/staff-signoffs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name, position, companyName, contactNumber, contactEmail }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setMessage({ type: "error", text: json.error || "Failed to save" }); return; }
    setMessage({ type: "ok", text: "Signoff details saved" });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
      <div className="flex items-center gap-2">
        <PenSquare size={16} className="text-amber-600" />
        <h2 className="text-[15px] font-medium text-slate-900">Signoff details</h2>
      </div>
      <p className="text-[12px] text-slate-400 mt-1">
        Shown under your name when you&apos;re picked as a signer on an issued Precedent document.
      </p>
      {loading ? (
        <div className="mt-4 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (shown in bold)"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] font-medium text-slate-900 focus:outline-none focus:border-indigo-500 transition-all" />
          <input value={position} onChange={e => setPosition(e.target.value)} placeholder="Position, e.g. Partner"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all" />
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all" />
          <input value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="Contact number"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all" />
          <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Contact email"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all" />
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default">
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
          {message && <MessageRow message={message} />}
        </div>
      )}
    </div>
  );
}

// Per-user notification preferences -- reads/writes profiles.
// notification_preferences directly (same direct-client-write convention
// AdminEmailTab.tsx uses for the company-level version of this). Renders
// off NOTIFICATION_EVENT_TYPES, the same registry AdminEmailTab.tsx uses,
// so the two can never list different events. A missing entry (whole event
// or one channel within it) means "on" -- see that column's own migration
// comment (supabase/migrations/20260729450000_notification_preferences.sql)
// for why this has to be opt-out, not opt-in.
type ChannelPrefs = { in_app?: boolean; email?: boolean; push?: boolean };

function NotificationPreferencesSection({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<Record<string, ChannelPrefs>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("notification_preferences").eq("id", userId).single();
      setPrefs(data?.notification_preferences || {});
      setLoading(false);
    })();
  }, [userId]);

  const toggle = async (eventKey: string, channel: keyof ChannelPrefs) => {
    const isOn = prefs[eventKey]?.[channel] !== false;
    const next = { ...prefs, [eventKey]: { ...prefs[eventKey], [channel]: !isOn } };
    setPrefs(next);
    await supabase.from("profiles").update({ notification_preferences: next }).eq("id", userId);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-indigo-600" />
        <h2 className="text-[15px] font-medium text-slate-900">Notifications</h2>
      </div>
      <p className="text-[12px] text-slate-400 mt-1">
        Choose what you&apos;re notified about, and how. A company admin can still turn an event off for everyone.
      </p>
      {loading ? (
        <div className="mt-4 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-[1fr_44px_44px_44px] gap-3 px-4">
            <span />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">In-app</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Email</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Push</span>
          </div>
          {NOTIFICATION_EVENT_TYPES.map(eventType => {
            const eventPrefs = prefs[eventType.key] || {};
            return (
              <div key={eventType.key} className="grid grid-cols-[1fr_44px_44px_44px] items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-slate-700">{eventType.label}</p>
                  <p className="text-[10px] text-slate-400 truncate">{eventType.description}</p>
                </div>
                {(["in_app", "email", "push"] as const).map(channel => {
                  const isOn = eventPrefs[channel] !== false;
                  return (
                    <button
                      key={channel}
                      onClick={() => toggle(eventType.key, channel)}
                      title={`${eventType.label}, ${channel.replace("_", "-")}: ${isOn ? "on" : "off"}`}
                      className={`w-11 h-6 rounded-full transition-colors shrink-0 mx-auto ${isOn ? "bg-slate-900" : "bg-slate-200"}`}
                    >
                      <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: { type: "ok" | "error"; text: string } }) {
  return (
    <p className={`mt-3 flex items-center gap-1.5 text-[12px] ${message.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
      {message.type === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
      {message.text}
    </p>
  );
}
