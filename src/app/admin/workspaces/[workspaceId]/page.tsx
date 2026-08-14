"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import { WorkspaceAccentColor, WorkspaceKind } from "@/types/workspace";

const accentOptions: { value: WorkspaceAccentColor; label: string; color: string }[] = [
  { value: "proveit-blue", label: "ProveIt blue", color: "var(--accent-proveit-blue)" },
  { value: "teal", label: "Teal", color: "var(--accent-teal)" },
  { value: "orange", label: "Orange", color: "var(--accent-orange)" },
  { value: "charcoal", label: "Charcoal", color: "var(--accent-charcoal)" },
];

const workspaceKinds: WorkspaceKind[] = ["company", "team", "board", "custom"];

type Settings = {
  name: string;
  icon: string;
  description: string;
  kind: WorkspaceKind;
  active: boolean;
  accentColor: WorkspaceAccentColor;
};

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace("/login");
  }, [authLoading, firebaseUser, router]);

  useEffect(() => {
    if (authLoading || !firebaseUser || !profile || profile.group !== "bod" || !workspaceId) return;
    let current = true;
    void Promise.all([
      getDoc(doc(db, "workspaces", workspaceId)),
      getMembershipsForWorkspace(workspaceId),
    ]).then(([workspaceSnapshot, memberships]) => {
      if (!current) return;
      if (!workspaceSnapshot.exists()) {
        setError("This workspace could not be found.");
        return;
      }
      const data = workspaceSnapshot.data();
      setSettings({
        name: data.name || "Untitled workspace",
        icon: data.icon || "📁",
        description: data.description || "",
        kind: (data.kind || "custom") as WorkspaceKind,
        active: data.active === true,
        accentColor: (data.accentColor || "proveit-blue") as WorkspaceAccentColor,
      });
      setMemberCount(memberships.length);
    }).catch(() => {
      if (current) setError("Workspace settings could not be loaded.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [authLoading, firebaseUser, profile, workspaceId]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !profile) return;
    try {
      setSaving(true);
      setError("");
      setSaved(false);
      await updateDoc(doc(db, "workspaces", workspaceId), {
        name: settings.name.trim() || "Untitled workspace",
        icon: settings.icon.trim() || "📁",
        description: settings.description.trim(),
        kind: settings.kind,
        active: settings.active,
        accentColor: settings.accentColor,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch {
      setError("Workspace settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading workspace settings…</main>;
  if (!firebaseUser || !profile) return null;
  if (profile.group !== "bod") return <main className="grid min-h-screen place-items-center bg-[var(--background)]"><div className="proveit-card max-w-md p-8 text-center"><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-[var(--muted)]">Workspace settings are restricted to BOD members.</p></div></main>;
  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading workspace settings…</main>;
  if (!settings) return <main className="grid min-h-screen place-items-center text-sm text-[var(--danger)]">{error || "Workspace unavailable."}</main>;

  const accessSummary = workspaceId === "company"
    ? "All active ProveIt employees can access this workspace."
    : workspaceId === "board"
      ? "Board access is controlled by the organization-level BOD role."
      : `${memberCount} explicit ${memberCount === 1 ? "member" : "members"} have access.`;

  return <main className="min-h-screen bg-[var(--background)]"><section className="proveit-content"><div className="proveit-content-inner max-w-4xl"><Link href="/admin/workspaces" className="proveit-back-link px-1">← Workspace settings</Link><header className="proveit-page-header"><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--border)] bg-white text-2xl shadow-[var(--shadow-sm)]">{settings.icon}</span><div><p className="proveit-label">Administration</p><h1 className="proveit-page-title mt-1">{settings.name} settings</h1></div></div>{settings.active ? <Link href={`/workspaces/${workspaceId}`} className="proveit-primary-button">Open workspace</Link> : <span className="text-sm text-[var(--muted)]">Restore this workspace to open it.</span>}</header><p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">Control the workspace identity and access foundation. More workspace defaults can be added here without changing the core route architecture.</p>{error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<form onSubmit={save} className="mt-8 grid gap-6"><section className="proveit-card p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="proveit-section-title">Identity</h2><p className="mt-1 text-sm text-[var(--muted)]">The name, icon, description, type, and state shown across ProveIt.</p></div>{!settings.active && <span className="rounded-full bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning-fg)]">Archived</span>}</div><div className="mt-6 grid gap-5 sm:grid-cols-[7rem_1fr]"><label className="text-sm font-medium">Icon<input aria-label="Workspace icon" value={settings.icon} onChange={(event) => setSettings({ ...settings, icon: event.target.value })} maxLength={4} className="proveit-control mt-2 w-full px-3 py-2 text-center" /></label><label className="text-sm font-medium">Workspace name<input aria-label="Workspace name" value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} className="proveit-control mt-2 w-full px-3 py-2" /></label></div><label className="mt-5 block text-sm font-medium">Description<textarea aria-label="Workspace description" value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} className="proveit-control mt-2 min-h-24 w-full px-3 py-2" /></label><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium">Workspace type<select aria-label="Workspace type" value={settings.kind} onChange={(event) => setSettings({ ...settings, kind: event.target.value as WorkspaceKind })} className="proveit-control mt-2 w-full px-3 py-2 capitalize">{workspaceKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label><label className="flex items-end gap-3 pb-2 text-sm font-medium"><input aria-label="Workspace active" type="checkbox" checked={settings.active} onChange={(event) => setSettings({ ...settings, active: event.target.checked })} />Active workspace</label></div></section><section className="proveit-card p-6"><h2 className="proveit-section-title">Workspace accent</h2><p className="mt-1 text-sm text-[var(--muted)]">A restrained ProveIt palette for future workspace branding surfaces.</p><fieldset className="mt-5 grid gap-3 sm:grid-cols-2"><legend className="sr-only">Workspace accent color</legend>{accentOptions.map((accent) => <label key={accent.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm transition ${settings.accentColor === accent.value ? "border-[var(--focus)] bg-[var(--selected)]" : "border-[var(--border)] hover:bg-[var(--hover)]"}`}><input type="radio" name="accentColor" value={accent.value} checked={settings.accentColor === accent.value} onChange={() => setSettings({ ...settings, accentColor: accent.value })} /><span className="h-4 w-4 rounded-full" style={{ backgroundColor: accent.color }} /><span>{accent.label}</span></label>)}</fieldset></section><section className="proveit-card p-6"><h2 className="proveit-section-title">Member and access summary</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{accessSummary}</p><p className="mt-2 text-xs text-[var(--subtle)]">Detailed membership management remains available in the existing workspace administration workflow.</p></section><div className="flex items-center justify-end gap-3"><span aria-live="polite" className="text-sm text-[var(--status-positive-fg)]">{saved ? "Settings saved" : ""}</span><button type="submit" disabled={saving} className="proveit-primary-button disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button></div></form></div></section></main>;
}
