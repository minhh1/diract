"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  ArrowLeft, Loader2, Camera, Trash2, CheckCircle2, AlertCircle, User,
} from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

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
            <ProfileForm
              // Remount with fresh initial state if the signed-in user ever changes.
              key={profile?.id || "anon"}
              initialFullName={profile?.full_name || ""}
              initialAvatarUrl={profile?.avatar_url || null}
              email={email}
            />
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
    setEmailMessage({ type: "ok", text: "Confirmation links sent to your old and new email — click both to finish the change." });
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

function MessageRow({ message }: { message: { type: "ok" | "error"; text: string } }) {
  return (
    <p className={`mt-3 flex items-center gap-1.5 text-[12px] ${message.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
      {message.type === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
      {message.text}
    </p>
  );
}
