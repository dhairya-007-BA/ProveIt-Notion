"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";
import { GLOBAL_CAPABILITIES, type GlobalCapability } from "@/lib/permissions";

type Props = { uid: string };
type Membership = { workspaceId: string; active?: boolean; accessLevel?: "member" | "admin"; role?: string };
type Workspace = { id: string; name: string };

export default function AccessPermissions({ uid }: Props) {
  const { firebaseUser } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [capabilities, setCapabilities] = useState<Partial<Record<GlobalCapability, boolean>>>({});
  const [error, setError] = useState("");

  async function load() {
    if (!firebaseUser) return;
    const response = await authenticatedRequest(firebaseUser, `/api/admin/employees/${uid}/permissions`);
    const data = await response.json().catch(() => null) as { success?: boolean; workspaces?: Workspace[]; memberships?: Membership[]; capabilities?: Partial<Record<GlobalCapability, boolean>>; code?: string } | null;
    if (!response.ok || data?.success !== true || !Array.isArray(data.workspaces) || !Array.isArray(data.memberships)) {
      console.info("Employee permissions load failed", { status: response.status, code: data?.code ?? "employee_permissions_invalid_response" });
      throw new Error("Access permissions could not be loaded.");
    }
    setWorkspaces(data.workspaces.filter((workspace) => workspace && typeof workspace.id === "string").map((workspace) => ({ id: workspace.id, name: workspace.name || workspace.id })));
    setMemberships(data.memberships); setCapabilities(data.capabilities || {}); setError("");
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(() => setError("Access permissions could not be loaded.")); }, 0); return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, firebaseUser]);
  async function update(payload: object) {
    if (!firebaseUser) return;
    setError("");
    const response = await authenticatedRequest(firebaseUser, `/api/admin/employees/${uid}/permissions`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) { const data = await response.json().catch(() => null) as { code?: string } | null; console.info("Employee permissions update failed", { status: response.status, code: data?.code ?? "employee_permissions_invalid_response" }); throw new Error("Permission update failed."); }
    await load();
  }
  const access = (workspaceId: string) => { const membership = memberships.find((item) => item.workspaceId === workspaceId && item.active); return membership?.accessLevel || (membership?.role === "admin" || membership?.role === "manager" ? "admin" : membership ? "member" : "none"); };
  return <section className="proveit-card p-5"><h2 className="proveit-section-title">Access &amp; Permissions</h2><p className="mt-1 text-xs text-[var(--muted)]">Employment role is descriptive. Access is managed independently.</p>{error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}<div className="mt-4 space-y-2">{workspaces.map((workspace) => <label key={workspace.id} className="flex items-center justify-between gap-3 text-sm"><span>{workspace.name}</span><select aria-label={`${workspace.name} access`} value={access(workspace.id)} onChange={(event) => void update({ workspaceId: workspace.id, accessLevel: event.target.value }).catch(() => setError("Permission update failed."))} className="proveit-control px-2 py-1"><option value="none">No Access</option><option value="member">Member</option><option value="admin">Workspace Admin</option></select></label>)}</div><fieldset className="mt-5 border-t border-[var(--border)] pt-4"><legend className="text-sm font-medium">Administrative access</legend>{GLOBAL_CAPABILITIES.map((capability) => <label key={capability} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={capabilities[capability] === true} onChange={(event) => void update({ capabilities: { [capability]: event.target.checked } }).catch(() => setError("Permission update failed."))} />{capability.replace(/([A-Z])/g, " $1")}</label>)}</fieldset></section>;
}
