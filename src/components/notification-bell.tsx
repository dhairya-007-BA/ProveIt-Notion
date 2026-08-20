"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";

type NotificationItem = {
  id: string;
  workspaceId: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date | null;
};

function destination(item: NotificationItem) {
  const prefix = `/workspaces/${item.workspaceId}`;
  if (item.entityType === "task") return `${prefix}/tasks/${item.entityId}`;
  if (item.entityType === "meeting") return `${prefix}/meetings/${item.entityId}`;
  if (item.entityType === "document") return `${prefix}/documents/${item.entityId}`;
  return item.workspaceId ? `${prefix}/inbox` : "/";
}

export function NotificationBell() {
  const { firebaseUser, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    let active = true;
    const unsubscribes: (() => void)[] = [];
    void getAccessibleWorkspaces(profile).then((workspaces) => {
      if (!active) return;
      setItems([]);
      const ids = workspaces.map((workspace) => workspace.id);
      for (let index = 0; index < ids.length; index += 30) {
        const workspaceIds = ids.slice(index, index + 30);
        const workspaceSet = new Set(workspaceIds);
        unsubscribes.push(onSnapshot(query(collection(db, "notifications"), where("recipientUid", "==", firebaseUser.uid), where("workspaceId", "in", workspaceIds)), (snapshot) => {
          const next = snapshot.docs.map((item) => ({
            id: item.id,
            workspaceId: typeof item.data().workspaceId === "string" ? item.data().workspaceId : "",
            title: typeof item.data().title === "string" ? item.data().title : "Notification",
            message: typeof item.data().message === "string" ? item.data().message : "",
            entityType: typeof item.data().entityType === "string" ? item.data().entityType : "",
            entityId: typeof item.data().entityId === "string" ? item.data().entityId : "",
            readAt: item.data().readAt?.toDate?.() ?? null,
            archivedAt: item.data().archivedAt?.toDate?.() ?? null,
            createdAt: item.data().createdAt?.toDate?.() ?? null,
          })).filter((item) => !item.archivedAt);
          setItems((current) => [...current.filter((item) => !workspaceSet.has(item.workspaceId)), ...next].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)));
        }));
      }
    }).catch(() => { if (active) setItems([]); });
    return () => { active = false; unsubscribes.forEach((unsubscribe) => unsubscribe()); };
  }, [firebaseUser, profile]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    function closeOutside(event: MouseEvent) { if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false); }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("mousedown", closeOutside);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("mousedown", closeOutside); };
  }, []);

  if (!firebaseUser || pathname === "/login") return null;
  const unread = items.filter((item) => !item.readAt).length;
  const visible = items.slice(0, 8);
  async function openNotification(item: NotificationItem) {
    if (!item.readAt) await updateDoc(doc(db, "notifications", item.id), { readAt: serverTimestamp() }).catch(() => undefined);
    setOpen(false);
    router.push(destination(item));
  }
  async function markAllRead() {
    const unreadItems = items.filter((item) => !item.readAt);
    if (!unreadItems.length) return;
    const batch = writeBatch(db);
    unreadItems.forEach((item) => batch.update(doc(db, "notifications", item.id), { readAt: serverTimestamp() }));
    await batch.commit().catch(() => undefined);
  }

  return <div ref={panelRef} className="relative">
    <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] shadow-sm transition hover:bg-[var(--hover)] hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--secondary)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {unread > 0 && <span aria-label={`${unread} unread notifications`} className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]" />}
    </button>
    {open && <section aria-label="Notifications" className="absolute right-0 mt-2 w-[360px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3"><div><h2 className="proveit-heading text-base font-semibold">Notifications</h2><p className="text-xs text-[var(--muted)]">{unread ? `${unread} unread` : "All caught up"}</p></div>{unread ? <button type="button" onClick={() => void markAllRead()} className="text-xs font-medium text-[var(--secondary)] hover:underline">Mark all read</button> : null}</header>
      <div className="max-h-[420px] overflow-y-auto">{visible.length ? visible.map((item) => <button key={item.id} type="button" onClick={() => void openNotification(item)} className={`w-full border-b border-[var(--border)] px-4 py-3 text-left transition hover:bg-[var(--hover)] ${!item.readAt ? "bg-[color-mix(in_srgb,var(--secondary)_6%,transparent)]" : ""}`}><p className="flex items-center gap-2 text-sm font-medium"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${item.readAt ? "bg-transparent" : "bg-[var(--secondary)]"}`} />{item.title}</p><p className="mt-1 line-clamp-2 pl-3.5 text-xs text-[var(--muted)]">{item.message}</p><p className="mt-1 pl-3.5 text-[11px] text-[var(--subtle)]">{item.workspaceId || "ProveIt"}</p></button>) : <div className="px-5 py-12 text-center"><svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto h-8 w-8 fill-none stroke-[var(--accent)] stroke-[1.5]"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" /></svg><p className="mt-3 text-sm font-medium">You’re all caught up</p><p className="mt-1 text-xs text-[var(--muted)]">New workspace updates will appear here.</p></div>}</div>
      {visible[0]?.workspaceId && <button type="button" onClick={() => { setOpen(false); router.push(`/workspaces/${visible[0].workspaceId}/inbox`); }} className="w-full border-t border-[var(--border)] px-4 py-3 text-left text-sm font-medium text-[var(--secondary)] hover:bg-[var(--hover)]">View all notifications</button>}
    </section>}
  </div>;
}
