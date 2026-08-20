"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

type Notification = { id: string; workspaceId: string; title: string; message: string; entityType: string; entityId: string; readAt?: Date | null; archivedAt?: Date | null; createdAt?: Date };
export default function InboxPage() { const { workspaceId } = useParams<{ workspaceId: string }>(); const router = useRouter(); const { firebaseUser, profile, loading } = useAuth(); const [items, setItems] = useState<Notification[]>([]); const [tab, setTab] = useState<"unread" | "all" | "archived">("unread"); const [error, setError] = useState("");
  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => { if (!firebaseUser) return; return onSnapshot(query(collection(db, "notifications"), where("recipientUid", "==", firebaseUser.uid), where("workspaceId", "==", workspaceId)), (snapshot) => setItems(snapshot.docs.map((item) => ({ id: item.id, workspaceId: item.data().workspaceId || "", title: item.data().title || "Notification", message: item.data().message || "", entityType: item.data().entityType || "", entityId: item.data().entityId || "", readAt: item.data().readAt?.toDate() || null, archivedAt: item.data().archivedAt?.toDate() || null, createdAt: item.data().createdAt?.toDate() })).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))), (listenerError) => { console.error("Failed to load notifications:", listenerError); setError("Notifications could not be loaded."); }); }, [firebaseUser, workspaceId]);
  async function update(id: string, fields: Record<string, unknown>) { try { await updateDoc(doc(db, "notifications", id), fields); } catch (updateError) { console.error("Failed to update notification:", updateError); setError("Notification could not be updated."); } }
  async function markAllRead() { if (!firebaseUser) return; const batch = writeBatch(db); items.filter((item) => !item.readAt && !item.archivedAt).forEach((item) => batch.update(doc(db, "notifications", item.id), { readAt: serverTimestamp() })); try { await batch.commit(); } catch (batchError) { console.error("Failed to mark notifications read:", batchError); setError("Notifications could not be updated."); } }
  function open(item: Notification) {
    if (!item.readAt) void update(item.id, { readAt: serverTimestamp() });
    if (!item.entityId) return;
    if (item.entityType === "task") router.push(`/workspaces/${workspaceId}/tasks/${item.entityId}`);
    if (item.entityType === "meeting") router.push(`/workspaces/${workspaceId}/meetings/${item.entityId}`);
    if (item.entityType === "document") router.push(`/workspaces/${workspaceId}/documents/${item.entityId}`);
    if (item.entityType === "database-row") {
      const [databaseId, rowId] = item.entityId.split(":");
      if (databaseId && rowId) router.push(`/workspaces/${workspaceId}/databases/${databaseId}/rows/${rowId}`);
    }
  }
  if (loading) return <main className="grid min-h-screen place-items-center">Loading…</main>; if (!firebaseUser || !profile) return null; const visible = items.filter((item) => tab === "archived" ? item.archivedAt : tab === "unread" ? !item.readAt && !item.archivedAt : !item.archivedAt);
  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className="mx-auto max-w-4xl"><Link href={`/workspaces/${workspaceId}`} className="proveit-back-link px-1">← Back to workspace</Link><div className="proveit-page-header"><div><p className="proveit-label">UPDATES</p><h1 className="proveit-page-title mt-1">Inbox</h1></div><button onClick={markAllRead} className="proveit-secondary-button">Mark all read</button></div><div className="mt-7 flex border-b border-[var(--border)]">{(["unread", "all", "archived"] as const).map((name) => <button key={name} onClick={() => setTab(name)} className={`border-b-2 px-3 py-2.5 text-sm capitalize ${tab === name ? "border-[var(--foreground)] font-medium" : "border-transparent text-[var(--muted)]"}`}>{name === "unread" ? "Inbox" : name}</button>)}</div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<div className="proveit-list mt-4">{visible.map((item) => <article key={item.id} className={`proveit-list-row flex items-center gap-3 border-b border-black/[0.08] px-4 py-4 last:border-b-0 ${!item.readAt ? "bg-white" : ""}`}><button aria-label={`Open ${item.title}`} onClick={() => open(item)} className="min-w-0 flex-1 text-left"><p className="text-sm font-medium">{!item.readAt && <span aria-label="Unread" className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />}{item.title}</p><p className="mt-1 text-sm text-[var(--muted)]">{item.message}</p><p className="mt-1 text-xs text-[var(--subtle)]">{item.createdAt?.toLocaleString() || "Just now"}</p></button><button onClick={() => update(item.id, { readAt: item.readAt ? null : serverTimestamp() })} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">{item.readAt ? "Unread" : "Read"}</button><button onClick={() => update(item.id, { archivedAt: item.archivedAt ? null : serverTimestamp() })} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">{item.archivedAt ? "Restore" : "Archive"}</button></article>)}{visible.length === 0 && <p className="px-4 py-12 text-sm text-[var(--muted)]">{tab === "unread" ? "You’re all caught up." : "No notifications here."}</p>}</div></div></section></main>;
}
