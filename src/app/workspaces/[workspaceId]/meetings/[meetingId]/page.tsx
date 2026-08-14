"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Comments } from "@/components/comments";
import { RecordContentSection, RecordDetailShell, RecordProperties, RecordProperty, RecordTitle } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";

type MeetingMetadata = { scheduledAt?: Date; attendees?: string[]; updatedAt?: Date };

export default function MeetingDetailPage() {
  const { workspaceId, meetingId } = useParams<{ workspaceId: string; meetingId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [title, setTitle] = useState(""); const [transcript, setTranscript] = useState(""); const [notes, setNotes] = useState(""); const [metadata, setMetadata] = useState<MeetingMetadata>({}); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!authLoading && !firebaseUser) router.replace("/login"); }, [authLoading, firebaseUser, router]);
  useEffect(() => { if (!firebaseUser || !profile) return; getDoc(doc(db, "meetings", meetingId)).then((snapshot) => { if (!snapshot.exists() || snapshot.data().workspaceId !== workspaceId) { setError("Meeting could not be found."); return; } const value = snapshot.data(); setTitle(value.title || "Untitled meeting"); setTranscript(value.transcript || ""); setNotes(value.notes || ""); setMetadata({ scheduledAt: value.scheduledAt?.toDate(), attendees: Array.isArray(value.attendees) ? value.attendees : [], updatedAt: value.updatedAt?.toDate() }); }).catch((loadError) => { console.error("Failed to load meeting:", loadError); setError("Meeting could not be loaded."); }).finally(() => setLoading(false)); }, [firebaseUser, profile, meetingId, workspaceId]);
  async function save() { try { setSaving(true); setError(""); await updateDoc(doc(db, "meetings", meetingId), { title: title.trim() || "Untitled meeting", transcript, notes, updatedAt: serverTimestamp() }); } catch (saveError) { console.error("Failed to save meeting:", saveError); setError("Meeting changes could not be saved."); } finally { setSaving(false); } }
  async function copyTranscript() { try { await navigator.clipboard.writeText(transcript); } catch (copyError) { console.error("Failed to copy transcript:", copyError); setError("Transcript could not be copied."); } }
  if (authLoading || loading) return <main className="grid min-h-screen place-items-center text-sm text-[#787774]">Loading meeting…</main>;
  if (!firebaseUser || !profile) return null;

  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/meetings`} backLabel="Meetings" actions={<button onClick={save} disabled={saving} className="rounded px-2 py-1 text-sm text-[#787774] transition hover:bg-black/[0.045] hover:text-[#37352f] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>}>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <RecordTitle ariaLabel="Meeting title" value={title} onChange={setTitle} />
    <RecordProperties>
      <RecordProperty label="Date and time" icon="□">{metadata.scheduledAt?.toLocaleString() || "Not scheduled"}</RecordProperty>
      <RecordProperty label="Participants" icon="◉">{metadata.attendees?.length ? metadata.attendees.join(", ") : "No participants added"}</RecordProperty>
      <RecordProperty label="Last edited" icon="◷">{metadata.updatedAt?.toLocaleString() || "—"}</RecordProperty>
    </RecordProperties>
    <RecordContentSection title="Notes" description="Add a summary, decisions, and action items."><textarea aria-label="Meeting notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={"Summary\n\nKey decisions\n\nAction items"} className="min-h-48 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[#9b9a97] hover:bg-black/[0.02] focus:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35" /></RecordContentSection>
    <RecordContentSection title="Transcript" description="Upload a recording when a server-side transcription provider is configured." action={<button onClick={copyTranscript} className="rounded px-2 py-1 text-sm text-[#787774] hover:bg-black/[0.045] hover:text-[#37352f]">Copy</button>}>
      <input ref={fileInput} aria-label="Upload recording" type="file" accept="audio/*,video/*" className="sr-only" onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} />
      <div className="mb-3 flex flex-wrap items-center gap-2"><button onClick={() => fileInput.current?.click()} className="rounded px-2 py-1 text-sm text-[#787774] hover:bg-black/[0.045] hover:text-[#37352f]">Upload recording</button><span className="text-xs text-[#9b9a97]">{fileName || "No recording selected"}</span><button disabled className="rounded bg-[#f1f1ef] px-2 py-1 text-sm text-[#9b9a97]" title="Configure a server-side transcription provider to enable this">Transcribe</button></div>
      <p className="mb-2 text-xs text-[#9b9a97]">Transcription is not configured in this deployment. No audio is uploaded or sent from this page.</p><textarea aria-label="Transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or edit a transcript here…" className="min-h-64 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[#9b9a97] hover:bg-black/[0.02] focus:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35" />
    </RecordContentSection>
    <Comments workspaceId={workspaceId} entityType="meeting" entityId={meetingId} />
  </RecordDetailShell>;
}
