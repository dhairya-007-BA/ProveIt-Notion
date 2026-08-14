"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

type Event = { id: string; description: string; createdAt?: Date; entityType: string };
export default function ActivityPage() { const { workspaceId } = useParams<{ workspaceId: string }>(); const router = useRouter(); const { firebaseUser, profile, loading } = useAuth(); const [events, setEvents] = useState<Event[]>([]); const [error, setError] = useState("");
  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => { if (!firebaseUser || !profile) return; return onSnapshot(query(collection(db, "activities"), where("workspaceId", "==", workspaceId)), (snapshot) => setEvents(snapshot.docs.map((item) => ({ id: item.id, description: item.data().description || "Updated workspace", entityType: item.data().entityType || "workspace", createdAt: item.data().createdAt?.toDate() })).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))), (listenerError) => { console.error("Failed to load activity:", listenerError); setError("Activity could not be loaded."); }); }, [firebaseUser, profile, workspaceId]);
  if (loading) return <main className="grid min-h-screen place-items-center">Loading…</main>; if (!firebaseUser || !profile) return null;
  return <main className="flex min-h-screen bg-[#fbfbfa]"><Sidebar /><section className="flex-1 px-6 py-8 md:px-10"><div className="mx-auto max-w-3xl"><Link href={`/workspaces/${workspaceId}`} className="text-sm text-[#787774]">← Back to workspace</Link><p className="mt-8 text-xs font-medium text-[#9b9a97]">WORKSPACE</p><h1 className="mt-1 text-4xl font-semibold tracking-[-0.03em]">Recent activity</h1><div className="mt-8 border-t border-black/[0.1]">{error && <p role="alert" className="py-4 text-sm text-red-700">{error}</p>}{events.map((event) => <div key={event.id} className="flex gap-3 border-b border-black/[0.08] py-3"><span className="mt-0.5 text-[#9b9a97]">◦</span><div><p className="text-sm">{event.description}</p><p className="mt-1 text-xs text-[#9b9a97]">{event.createdAt?.toLocaleString() || "Just now"}</p></div></div>)}{!error && events.length === 0 && <p className="py-8 text-sm text-[#787774]">No recorded activity yet.</p>}</div></div></section></main>;
}
