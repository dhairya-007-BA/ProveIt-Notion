"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

export default function WorkspaceMembersAccess({ workspaceId }: { workspaceId: string }) {
  const { firebaseUser } = useAuth();
  const [users, setUsers] = useState<{ uid: string; name: string; employeeId: string }[]>([]);
  const [access, setAccess] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function load() {
    if (!firebaseUser) return;
    const [userDocs, membershipDocs] = await Promise.all([
      getDocs(query(collection(db, "users"), where("active", "==", true))),
      getDocs(query(collection(db, "workspaceMemberships"), where("workspaceId", "==", workspaceId))),
    ]);
    setUsers(userDocs.docs.map((doc) => ({ uid: doc.id, name: doc.data().name || doc.id, employeeId: doc.data().employeeId || "" })));
    setAccess(Object.fromEntries(membershipDocs.docs.filter((doc) => doc.data().active).map((doc) => [doc.data().userId, doc.data().accessLevel || (doc.data().role === "admin" || doc.data().role === "manager" ? "admin" : "member")] )));
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(() => setError("Members could not be loaded.")); }, 0); return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, firebaseUser]);
  async function update(uid: string, accessLevel: string) {
    if (!firebaseUser) return;
    try {
      setUpdating(uid); setError(""); setNotice("");
      const token = await firebaseUser.getIdToken();
      const response = await fetch(`/api/admin/employees/${uid}/permissions`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, accessLevel }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || "Access could not be updated."); }
      await load(); setNotice("Workspace access updated.");
    } finally { setUpdating(null); }
  }
  return <section className="proveit-card p-5 sm:p-6"><h2 className="proveit-section-title">Members &amp; access</h2><p className="mt-1 text-sm text-[var(--muted)]">Manage this workspace using the same access records shown in employee administration.</p>{error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-[var(--success)]">{notice}</p>}<div className="mt-5 divide-y divide-[var(--border)]">{users.map((user) => <div key={user.uid} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><div><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-[var(--subtle)]">{user.employeeId}</p></div><select aria-label={`${user.name} workspace access`} value={access[user.uid] || "none"} disabled={updating === user.uid} onChange={(event) => void update(user.uid, event.target.value).catch((reason) => setError(reason.message))} className="proveit-control w-full px-2 py-2 text-sm disabled:opacity-60 sm:w-auto"><option value="none">No Access</option><option value="member">Member</option><option value="admin">Workspace Admin</option></select></div>)}</div></section>;
}
