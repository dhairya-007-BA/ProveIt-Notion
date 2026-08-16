"use client";

import { signOut } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { BackButton } from "@/components/back-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { auth } from "@/lib/firebase";
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
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [firebaseUser, loading, router]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPhoneNumber(profile?.phoneNumber || ""), 0);
    return () => window.clearTimeout(timer);
  }, [profile?.phoneNumber]);
  useEffect(() => { if (!profile) return; void getAccessibleWorkspaces(profile).then(setWorkspaces).catch(() => setWorkspaces([])); }, [profile]);

  const names = useMemo(() => splitName(profile?.name || ""), [profile?.name]);
  async function savePhone(event: React.FormEvent) {
    event.preventDefault();
    if (!firebaseUser) return;
    try {
      setSaving(true); setNotice("");
      const response = await authenticatedRequest(firebaseUser, "/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber }) });
      const body = await response.json().catch(() => null) as { success?: boolean; message?: string; profile?: { phoneNumber?: string | null } } | null;
      if (!response.ok || !body?.success) throw new Error(body?.message || "Profile could not be updated.");
      setPhoneNumber(body.profile?.phoneNumber || "");
      await refreshProfile();
      setNotice("Contact information saved.");
    } catch { setNotice("Profile could not be updated. Please try again."); }
    finally { setSaving(false); }
  }
  async function logout() { await signOut(auth); router.replace("/login"); }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">Loading profile…</main>;
  if (!firebaseUser || !profile) return null;
  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className="mx-auto max-w-3xl"><BackButton href="/" label="Home" /><header className="proveit-page-header"><div><p className="proveit-label">Your profile</p><h1 className="proveit-page-title mt-1">Profile</h1><p className="mt-2 text-sm text-[var(--muted)]">Manage your personal and contact information.</p></div></header>
    <section className="proveit-card mt-7 flex items-center gap-4 p-5"><div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--selected)] font-semibold text-[var(--secondary)]">{initials(profile.name)}</div><div className="min-w-0"><p className="proveit-heading truncate text-lg font-semibold">{profile.name}</p><p className="mt-1 text-sm text-[var(--muted)]">Employee ID · {profile.employeeId}</p><p className="mt-1 text-xs capitalize text-[var(--subtle)]">{profile.department || roleLabel(profile.group)}</p></div></section>
    <section className="mt-9"><h2 className="proveit-section-title">Personal information</h2><div className="proveit-card mt-3 divide-y divide-[var(--border)]"><ProfileRow label="First name" value={names.first} /><ProfileRow label="Last name" value={names.last} /></div></section>
    <section className="mt-8"><h2 className="proveit-section-title">Contact information</h2><div className="proveit-card mt-3 p-5"><ProfileRow label="Work email" value={profile.email || "Not available"} /><form onSubmit={savePhone} className="mt-5 border-t border-[var(--border)] pt-5"><label className="block text-sm font-medium">Phone number <span className="font-normal text-[var(--muted)]">(optional)</span><input aria-label="Phone number" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} maxLength={40} placeholder="+1 555 555 5555" className="proveit-control mt-2 w-full px-3 py-2" /></label><div className="mt-3 flex items-center gap-3"><button disabled={saving} className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving…" : "Save contact information"}</button>{notice && <p role="status" className="text-sm text-[var(--muted)]">{notice}</p>}</div></form></div></section>
    <section className="mt-8"><h2 className="proveit-section-title">Company information</h2><div className="proveit-card mt-3 divide-y divide-[var(--border)]"><ProfileRow label="Employee ID" value={profile.employeeId} /><ProfileRow label="Access group" value={roleLabel(profile.group)} /><ProfileRow label="Department" value={profile.department || "Not assigned"} /><ProfileRow label="Workspaces" value={workspaces.length ? workspaces.map((workspace) => workspace.name).join(", ") : "No workspaces available"} /></div></section>
    <section id="appearance" className="mt-8"><h2 className="proveit-section-title">Account</h2><div className="proveit-card mt-3 flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-medium">Appearance</p><p className="mt-1 text-sm text-[var(--muted)]">Switch between light and dark mode.</p></div><ThemeToggle /></div><div className="mt-3"><button type="button" onClick={() => void logout()} className="proveit-secondary-button text-[var(--danger)]">Sign out</button></div></section>
  </div></section></main>;
}

function ProfileRow({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4"><p className="text-sm text-[var(--muted)]">{label}</p><p className="text-sm text-[var(--text)]">{value}</p></div>; }
