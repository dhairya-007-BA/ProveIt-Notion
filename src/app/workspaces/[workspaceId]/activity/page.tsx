"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { activityHref } from "@/lib/activity-link";

type Event = { id: string; description: string; createdAt?: Date; entityType: string; entityId?: string };

export default function ActivityPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [firebaseUser, loading, router]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return onSnapshot(query(collection(db, "activity"), where("workspaceId", "==", workspaceId)), (snapshot) => setEvents(snapshot.docs.map((item) => ({ id: item.id, description: item.data().description || "Updated workspace", entityType: item.data().entityType || "workspace", entityId: typeof item.data().entityId === "string" ? item.data().entityId : undefined, createdAt: item.data().createdAt?.toDate() })).sort((left, right) => (right.createdAt?.getTime() || 0) - (left.createdAt?.getTime() || 0))), (listenerError) => {
      console.error("Failed to load activity from activity:", listenerError);
      setError("Recent activity could not be loaded.");
    });
  }, [firebaseUser, profile, workspaceId]);

  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading activity…</main>;
  if (!firebaseUser || !profile) return null;

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="min-w-0 flex-1 px-5 py-7 sm:px-8 md:px-10"><div className="mx-auto max-w-3xl"><Link href={`/workspaces/${workspaceId}`} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">← Back to workspace</Link><header className="mt-7"><p className="proveit-label">Workspace</p><h1 className="proveit-page-title mt-1">Recent activity</h1><p className="mt-2 text-sm text-[var(--muted)]">A chronological record of work in this workspace.</p></header><div className="mt-8">{error && <p role="alert" className="border-b border-[var(--border)] py-4 text-sm text-[var(--danger)]">{error}</p>}{events.length > 0 && <p className="proveit-label border-b border-[var(--border)] pb-2">Recent</p>}{events.map((event) => { const href = activityHref({ workspaceId, entityType: event.entityType, entityId: event.entityId }); const content = <><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--subtle)]" /><span><span className="block text-sm">{event.description}</span><span className="mt-1 block text-xs text-[var(--muted)]">{event.createdAt?.toLocaleString() || "Just now"}</span></span></>; return href ? <Link key={event.id} href={href} className="flex gap-3 border-b border-[var(--border)] py-4 transition hover:bg-[var(--hover)]">{content}</Link> : <article key={event.id} className="flex gap-3 border-b border-[var(--border)] py-4">{content}</article>; })}{!error && events.length === 0 && <p className="py-10 text-sm text-[var(--muted)]">No recorded activity yet.</p>}</div></div></section></main>;
}
