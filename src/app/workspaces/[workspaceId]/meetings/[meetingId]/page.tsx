"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { MeetingEditor } from "@/components/meetings/meeting-editor";
import { RecordDetailShell } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";
import { meetingFromFirestore, MeetingRecord } from "@/lib/meetings";

export default function MeetingDetailPage() {
  const { workspaceId, meetingId } = useParams<{ workspaceId: string; meetingId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !firebaseUser) router.replace("/login"); }, [authLoading, firebaseUser, router]);
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return onSnapshot(doc(db, "meetings", meetingId), (snapshot) => {
      if (!snapshot.exists()) { setError("Meeting could not be found."); return; }
      const next = meetingFromFirestore(snapshot.id, snapshot.data());
      if (next.workspaceId !== workspaceId) { setError("Meeting could not be found."); return; }
      setMeeting(next);
    }, () => setError("Meeting could not be loaded."));
  }, [firebaseUser, meetingId, profile, workspaceId]);

  if (authLoading || (!meeting && !error)) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading meeting…</main>;
  if (!firebaseUser || !profile || !meeting) return <main className="grid min-h-screen place-items-center text-sm text-[var(--danger)]">{error}</main>;
  const canDelete = profile.group === "bod";

  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/meetings`} backLabel="Meetings"><MeetingEditor key={meeting.id} meeting={meeting} currentUserId={firebaseUser.uid} canDelete={canDelete} onDeleted={() => router.replace(`/workspaces/${workspaceId}/meetings`)} /></RecordDetailShell>;
}
