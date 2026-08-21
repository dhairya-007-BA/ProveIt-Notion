"use client";

import { signOut } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { BackButton } from "@/components/back-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { auth } from "@/lib/firebase";
import type { NotificationPreferences } from "@/lib/notification-preferences";
import type { Workspace } from "@/types/workspace";

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P"; }
function splitName(name: string) { const parts = name.trim().split(/\s+/); return { first: parts[0] || "—", last: parts.slice(1).join(" ") || "—" }; }
function roleLabel(role: string) { return role.replace(/_/g, " "); }

export default function ProfilePage() {
  const { firebaseUser, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [saving, setSaving] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesError, setPreferencesError] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);

  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [firebaseUser, loading, router]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPhoneNumber(profile?.phoneNumber || ""), 0);
    return () => window.clearTimeout(timer);
  }, [profile?.phoneNumber]);
  useEffect(() => { if (!profile) return; void getAccessibleWorkspaces(profile).then(setWorkspaces).catch(() => setWorkspaces([])); }, [profile]);
  const loadPreferences = useCallback(async () => {
    if (!firebaseUser) return;
    setPreferences(null);
    setPreferencesError("");
    try {
      const response = await authenticatedRequest(firebaseUser, "/api/profile/notification-preferences");
      const body = await response.json().catch(() => null) as { success?: boolean; preferences?: NotificationPreferences; message?: string } | null;
      if (!response.ok || !body?.success || !body.preferences) throw new Error(body?.message || "Preferences could not be loaded.");
      setPreferences(body.preferences);
    } catch { setPreferencesError("Notification preferences are unavailable. Retry to load your saved settings."); }
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser) return;
    const timer = window.setTimeout(() => void loadPreferences(), 0);
    return () => window.clearTimeout(timer);
  }, [firebaseUser, loadPreferences]);

  const names = useMemo(() => splitName(profile?.name || ""), [profile?.name]);
  async function savePhone(event: React.FormEvent) {
    event.preventDefault();
    if (!firebaseUser) return;
    try {
      setSaving(true); setPhoneNotice(""); setPhoneError("");
      const response = await authenticatedRequest(firebaseUser, "/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber }) });
      const body = await response.json().catch(() => null) as { success?: boolean; message?: string; profile?: { phoneNumber?: string | null } } | null;
      if (!response.ok || !body?.success) throw new Error(body?.message || "Profile could not be updated.");
      setPhoneNumber(body.profile?.phoneNumber || "");
      await refreshProfile();
      setPhoneNotice("Contact information saved.");
    } catch { setPhoneError("Profile could not be updated. Check the phone number and try again."); }
    finally { setSaving(false); }
  }
  async function logout() { await signOut(auth); router.replace("/login"); }
  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    if (!firebaseUser || !preferences) return;
    try {
      setSavingPreferences(true); setPreferencesError("");
      const response = await authenticatedRequest(firebaseUser, "/api/profile/notification-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      const body = await response.json().catch(() => null) as { success?: boolean; preferences?: NotificationPreferences; message?: string } | null;
      if (!response.ok || !body?.success || !body.preferences) throw new Error(body?.message || "Preferences could not be saved.");
      setPreferences(body.preferences);
      setPreferencesError("Notification preferences saved.");
    } catch { setPreferencesError("Notification preferences could not be saved. Please try again."); }
    finally { setSavingPreferences(false); }
  }

  function setPreference(channel: "inApp" | "email", key: string, checked: boolean) {
    setPreferences((current) => current ? { ...current, [channel]: { ...current[channel], [key]: checked } } : current);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">Loading profile…</main>;
  if (!firebaseUser || !profile) return null;
  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className="mx-auto max-w-3xl"><BackButton href="/" label="Home" /><header className="proveit-page-header"><div><p className="proveit-label">Your profile</p><h1 className="proveit-page-title mt-1">Profile</h1><p className="mt-2 text-sm text-[var(--muted)]">Manage your personal and contact information.</p></div></header>
    <section className="proveit-card mt-7 flex items-center gap-4 p-5"><div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--selected)] font-semibold text-[var(--secondary)]">{initials(profile.name)}</div><div className="min-w-0"><p className="proveit-heading truncate text-lg font-semibold">{profile.name}</p><p className="mt-1 text-sm text-[var(--muted)]">Employee ID · {profile.employeeId}</p><p className="mt-1 text-xs capitalize text-[var(--subtle)]">{profile.department || roleLabel(profile.group)}</p></div></section>
    <section className="mt-9"><h2 className="proveit-section-title">Personal information</h2><div className="proveit-card mt-3 divide-y divide-[var(--border)]"><ProfileRow label="First name" value={names.first} /><ProfileRow label="Last name" value={names.last} /></div></section>
    <section className="mt-8"><h2 className="proveit-section-title">Contact information</h2><div className="proveit-card mt-3 p-5"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"><p className="text-xs font-medium uppercase tracking-wide text-[var(--subtle)]">Work email</p>{profile.email ? <><p className="mt-2 break-all text-sm font-medium text-[var(--foreground)]">{profile.email}</p><p className="mt-1 text-xs text-[var(--muted)]">Managed by ProveIt</p></> : <><p className="mt-2 text-sm font-medium text-[var(--foreground)]">No company work email has been provisioned</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Your Employee ID remains your sign-in identifier. Contact an administrator if you need a work email added to your employee record.</p></>}</div><form onSubmit={savePhone} className="mt-5 border-t border-[var(--border)] pt-5"><label className="block text-sm font-medium">Phone number <span className="font-normal text-[var(--muted)]">(optional)</span><input aria-label="Phone number" type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => { setPhoneNumber(event.target.value); setPhoneError(""); setPhoneNotice(""); }} maxLength={40} placeholder="+1 555 555 5555" aria-describedby="phone-help" className="proveit-control mt-2 w-full px-3 py-2" /></label><p id="phone-help" className="mt-2 text-xs text-[var(--muted)]">Use digits, spaces, parentheses, plus, hyphen, or period. Leave blank to remove it.</p>{phoneError && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{phoneError}</p>}<div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center"><button disabled={saving} className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving…" : "Save contact information"}</button>{phoneNotice && <p role="status" className="text-sm text-[var(--success)]">{phoneNotice}</p>}</div></form></div></section>
    <section className="mt-8"><h2 className="proveit-section-title">Company information</h2><div className="proveit-card mt-3 grid gap-4 p-5 sm:grid-cols-2"><CompanyDatum label="Employee ID" value={profile.employeeId} /><CompanyDatum label="Access group" value={roleLabel(profile.group)} /><CompanyDatum label="Department" value={profile.department || "Not assigned"} /><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-[var(--subtle)]">Workspaces</p><div className="mt-3 flex flex-wrap gap-2">{workspaces.length ? workspaces.map((workspace) => <span key={workspace.id} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium">{workspace.name}</span>) : <span className="text-sm text-[var(--muted)]">No workspaces available</span>}</div></div></div></section>
    <section className="mt-8" aria-labelledby="notification-preferences-heading"><h2 id="notification-preferences-heading" className="proveit-section-title">Notification preferences</h2><p className="mt-2 text-sm text-[var(--muted)]">Choose how ProveIt keeps you informed. Account and security messages are always delivered when required.</p><form onSubmit={savePreferences} className="proveit-card mt-3 p-5">{preferences ? <div className="grid gap-7 md:grid-cols-2"><fieldset><legend className="text-sm font-semibold">In-app</legend><p className="mt-1 text-xs text-[var(--muted)]">Shown in the notification bell and Inbox.</p><div className="mt-4 grid gap-1"><PreferenceToggle label="Mentions" description="When a teammate mentions you in a comment." checked={preferences.inApp.mentions} onChange={(value) => setPreference("inApp", "mentions", value)} /><PreferenceToggle label="Replies" description="When someone replies to your comment." checked={preferences.inApp.replies} onChange={(value) => setPreference("inApp", "replies", value)} /><PreferenceToggle label="Assignments" description="Task assignments and meeting invitations." checked={preferences.inApp.assignments} onChange={(value) => setPreference("inApp", "assignments", value)} /><PreferenceToggle label="Reminders" description="Task deadlines and meeting reminders." checked={preferences.inApp.reminders} onChange={(value) => setPreference("inApp", "reminders", value)} /></div></fieldset><fieldset><legend className="text-sm font-semibold">Email</legend><p className="mt-1 text-xs text-[var(--muted)]">Sent to {profile.email || "your work email when available"}.</p><div className="mt-4 grid gap-1"><PreferenceToggle label="Mentions" description="Email when you are mentioned." checked={preferences.email.mentions} onChange={(value) => setPreference("email", "mentions", value)} /><PreferenceToggle label="Replies" description="Email when your comment receives a reply." checked={preferences.email.replies} onChange={(value) => setPreference("email", "replies", value)} /><PreferenceToggle label="Task assignments" description="Email when work is assigned to you." checked={preferences.email.taskAssignments} onChange={(value) => setPreference("email", "taskAssignments", value)} /><PreferenceToggle label="Task reminders" description="Email for approaching and overdue tasks." checked={preferences.email.taskReminders} onChange={(value) => setPreference("email", "taskReminders", value)} /><PreferenceToggle label="Meeting invitations" description="Email when you are invited to a meeting." checked={preferences.email.meetingInvitations} onChange={(value) => setPreference("email", "meetingInvitations", value)} /><PreferenceToggle label="Meeting reminders" description="Email before scheduled meetings." checked={preferences.email.meetingReminders} onChange={(value) => setPreference("email", "meetingReminders", value)} /></div></fieldset></div> : preferencesError ? <div role="alert" className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4"><p className="text-sm text-[var(--muted)]">{preferencesError}</p><button type="button" onClick={() => void loadPreferences()} className="proveit-secondary-button mt-3">Retry</button></div> : <p className="text-sm text-[var(--muted)]">Loading notification preferences…</p>}<div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5"><button disabled={!preferences || savingPreferences} className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-60">{savingPreferences ? "Saving…" : "Save notification preferences"}</button>{preferences && preferencesError && <p role="status" className="text-sm text-[var(--muted)]">{preferencesError}</p>}</div></form></section>
    <section id="appearance" className="mt-8"><h2 className="proveit-section-title">Account</h2><div className="proveit-card mt-3 flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-medium">Appearance</p><p className="mt-1 text-sm text-[var(--muted)]">Switch between light and dark mode.</p></div><ThemeToggle /></div><div className="mt-3"><button type="button" onClick={() => void logout()} className="proveit-secondary-button text-[var(--danger)]">Sign out</button></div></section>
  </div></section></main>;
}

function ProfileRow({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4"><p className="text-sm text-[var(--muted)]">{label}</p><p className="text-sm text-[var(--text)]">{value}</p></div>; }

function CompanyDatum({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"><p className="text-xs font-medium uppercase tracking-wide text-[var(--subtle)]">{label}</p><p className="mt-2 text-sm font-medium capitalize text-[var(--foreground)]">{value}</p></div>; }

function PreferenceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-3 hover:bg-[var(--hover)]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" /><span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{description}</span></span></label>;
}
