"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { MeetingEditor } from "@/components/meetings/meeting-editor";
import { db } from "@/lib/firebase";
import { meetingFromFirestore, meetingStatusLabel, MeetingRecord } from "@/lib/meetings";

export default function MeetingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, profile, loading } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => meetings.find((meeting) => meeting.id === searchParams.get("meeting")) || null, [meetings, searchParams]);

  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return onSnapshot(query(collection(db, "meetings"), where("workspaceId", "==", workspaceId)), (snapshot) => {
      setMeetings(snapshot.docs.map((item) => meetingFromFirestore(item.id, item.data())).sort((left, right) => (right.startAt?.getTime() || right.updatedAt?.getTime() || 0) - (left.startAt?.getTime() || left.updatedAt?.getTime() || 0)));
    }, () => setError("Meetings could not be loaded."));
  }, [firebaseUser, profile, workspaceId]);

  async function createMeeting() {
    if (!firebaseUser || creating) return;
    try {
      setCreating(true); setError("");
      const ref = await addDoc(collection(db, "meetings"), { title: "Untitled meeting", workspaceId, createdBy: firebaseUser.uid, organizerId: firebaseUser.uid, participantIds: [], status: "scheduled", notes: "", transcript: "", location: "", meetingUrl: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      router.push(`/workspaces/${workspaceId}/meetings?meeting=${ref.id}`);
    } catch { setError("Meeting could not be created."); } finally { setCreating(false); }
  }

  if (loading || (!profile && firebaseUser)) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading meetings…</main>;
  if (!firebaseUser || !profile) return null;
  const canDelete = profile.group === "bod";

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className={`mx-auto ${selected ? "max-w-none" : "max-w-5xl"}`}><Link href={`/workspaces/${workspaceId}`} className="proveit-back-link px-1">← Back to workspace</Link><header className="proveit-page-header mb-8"><div><p className="proveit-label">Meetings</p><h1 className="proveit-page-title mt-1">Meetings</h1><p className="mt-3 text-sm text-[var(--muted)]">Plan, run, and record conversations with your workspace.</p></div><button onClick={createMeeting} disabled={creating} className="proveit-primary-button disabled:opacity-50">{creating ? "Creating…" : "New meeting"}</button></header>{error && <p role="alert" className="mb-4 text-sm text-[var(--danger)]">{error}</p>}<div className={selected ? "grid min-w-0 grid-cols-1 min-[1351px]:grid-cols-[minmax(0,1fr)_minmax(430px,40%)]" : ""}><div className="proveit-list min-w-0">{meetings.map((meeting) => <button key={meeting.id} onClick={() => router.push(`/workspaces/${workspaceId}/meetings?meeting=${meeting.id}`)} className="proveit-list-row flex w-full items-center gap-3 border-b border-[var(--border)] px-5 py-4 text-left last:border-0 hover:bg-[var(--hover)]"><span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--sidebar)]">◷</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{meeting.title}</p><p className="mt-1 text-xs text-[var(--subtle)]">{meeting.startAt?.toLocaleString() || meeting.updatedAt?.toLocaleString() || "Not scheduled"}</p></div><span className={`proveit-status-badge proveit-status-${meeting.status}`}>{meetingStatusLabel(meeting.status)}</span></button>)}{meetings.length === 0 && <p className="px-5 py-12 text-sm text-[var(--muted)]">No meetings yet. Create the first meeting for this workspace.</p>}</div>{selected && <aside aria-label="Meeting detail pane" className="proveit-side-pane min-h-[calc(100vh-10rem)] border-l border-[var(--border)] px-5 py-4 min-[1351px]:sticky min-[1351px]:top-0"><div className="sticky top-0 z-10 flex justify-between bg-[var(--surface)] pb-3"><button aria-label="Close meeting pane" onClick={() => router.push(`/workspaces/${workspaceId}/meetings`)} className="proveit-secondary-button">× Close</button><Link aria-label="Expand meeting" href={`/workspaces/${workspaceId}/meetings/${selected.id}`} className="proveit-secondary-button">↗ Expand</Link></div><div className="max-h-[calc(100vh-13rem)] overflow-y-auto pr-1"><MeetingEditor meeting={selected} currentUserId={firebaseUser.uid} canDelete={canDelete} compact onDeleted={() => router.push(`/workspaces/${workspaceId}/meetings`)} /></div></aside>}</div></div></section></main>;
}
