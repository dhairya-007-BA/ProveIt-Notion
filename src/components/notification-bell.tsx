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

function formatRelativeTime(value: Date | null) {
  if (!value) return "Just now";
  const seconds = Math.round((value.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function destination(item: NotificationItem) {
  const prefix = `/workspaces/${item.workspaceId}`;
  if (item.entityType === "task") return `${prefix}/tasks/${item.entityId}`;
  if (item.entityType === "meeting") return `${prefix}/meetings/${item.entityId}`;
  if (item.entityType === "document") return `${prefix}/documents/${item.entityId}`;
  if (item.entityType === "database-row") {
    const [databaseId, rowId] = item.entityId.split(":");
    if (databaseId && rowId) return `${prefix}/databases/${databaseId}/rows/${rowId}`;
  }
  return item.workspaceId ? `${prefix}/inbox` : "/";
}

export function NotificationBell() {
  const { firebaseUser, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [workspaceNames, setWorkspaceNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    let active = true;
    const unsubscribes: (() => void)[] = [];
    void getAccessibleWorkspaces(profile).then((workspaces) => {
      if (!active) return;
      setItems([]);
      setWorkspaceNames(Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])));
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
          setError("");
        }, () => setError("Notifications could not be loaded.")));
      }
    }).catch(() => { if (active) { setItems([]); setError("Notifications could not be loaded."); } });
    return () => { active = false; unsubscribes.forEach((unsubscribe) => unsubscribe()); };
  }, [firebaseUser, profile]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape" && open) { setOpen(false); triggerRef.current?.focus(); } }
    function closeOutside(event: MouseEvent) { if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false); }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("mousedown", closeOutside);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("mousedown", closeOutside); };
  }, [open]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => firstItemRef.current?.focus());
  }, [open]);

  if (!firebaseUser || pathname === "/login") return null;
  const unread = items.filter((item) => !item.readAt).length;
  const visible = items.slice(0, 8);
  async function openNotification(item: NotificationItem) {
    if (!item.readAt) await updateDoc(doc(db, "notifications", item.id), { readAt: serverTimestamp() }).catch(() => setError("Notification could not be marked as read."));
    setOpen(false);
    router.push(destination(item));
  }
  async function markAllRead() {
    const unreadItems = items.filter((item) => !item.readAt);
    if (!unreadItems.length) return;
    const batch = writeBatch(db);
    unreadItems.forEach((item) => batch.update(doc(db, "notifications", item.id), { readAt: serverTimestamp() }));
    await batch.commit().then(() => setError("")).catch(() => setError("Notifications could not be marked as read."));
  }

  return <div ref={panelRef} className="relative">
    <button ref={triggerRef} type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-controls="notification-popover" onClick={() => setOpen((value) => !value)} className="relative grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {unread > 0 && <span aria-label={`${unread} unread notifications`} className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]" />}
    </button>
    {open && <section id="notification-popover" role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised,var(--surface))] shadow-[var(--shadow-md)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3"><div><h2 className="proveit-heading text-base font-semibold">Notifications</h2><p className="text-xs text-[var(--muted)]">{unread ? `${unread} unread` : "All caught up"}</p></div>{unread ? <button type="button" onClick={() => void markAllRead()} className="text-xs font-medium text-[var(--secondary)] hover:underline">Mark all read</button> : null}</header>
      {error ? <p role="alert" className="border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-2 text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="max-h-[min(420px,60vh)] overflow-y-auto">{visible.length ? visible.map((item, index) => <button ref={index === 0 ? firstItemRef : undefined} key={item.id} type="button" onClick={() => void openNotification(item)} className={`w-full border-b border-[var(--border)] px-4 py-3 text-left transition hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] ${!item.readAt ? "bg-[var(--info-soft)]" : ""}`}><p className={`flex items-center gap-2 text-sm ${!item.readAt ? "font-semibold" : "font-medium"}`}><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-[var(--info)]"}`} />{item.title}{!item.readAt ? <span className="sr-only">Unread</span> : null}</p><p className="mt-1 line-clamp-2 pl-4 text-xs text-[var(--muted)]">{item.message}</p><p className="mt-1 flex gap-2 pl-4 text-xs text-[var(--text-subtle,var(--subtle))]"><span>{workspaceNames[item.workspaceId] || item.workspaceId || "ProveIt"}</span><span aria-hidden>·</span><time dateTime={item.createdAt?.toISOString()}>{formatRelativeTime(item.createdAt)}</time></p></button>) : <div className="px-5 py-12 text-center"><svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto h-8 w-8 fill-none stroke-[var(--accent)] stroke-[1.5]"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" /></svg><p className="mt-3 text-sm font-medium">You’re all caught up</p><p className="mt-1 text-xs text-[var(--muted)]">New workspace updates will appear here.</p></div>}</div>
      {visible[0]?.workspaceId && <button type="button" onClick={() => { setOpen(false); router.push(`/workspaces/${visible[0].workspaceId}/inbox`); }} className="w-full border-t border-[var(--border)] px-4 py-3 text-left text-sm font-medium text-[var(--secondary)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]">View all in {workspaceNames[visible[0].workspaceId] || "workspace"}</button>}
    </section>}
  </div>;
}
