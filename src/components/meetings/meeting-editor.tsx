"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";

import { Comments } from "@/components/comments";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MeetingExecutionPanel } from "@/components/meetings/meeting-execution-panel";
import { EmployeeMultiPicker } from "@/components/people/employee-multi-picker";
import { RecordContentSection, RecordProperties, RecordProperty, RecordTitle } from "@/components/record-detail-shell";
import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";
import { db } from "@/lib/firebase";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import { eligibleWorkspaceUsers, meetingStatusLabel, meetingStatuses, MeetingRecord, MeetingStatus, validateMeetingDraft } from "@/lib/meetings";
import { getUsers } from "@/lib/users";
import { ProveItUser } from "@/types/user";

function dateInput(date?: Date) { return date ? date.toISOString().slice(0, 10) : ""; }
function timeInput(date?: Date) { return date ? date.toTimeString().slice(0, 5) : ""; }
function combine(date: string, time: string) { return date ? new Date(`${date}T${time || "12:00"}:00`) : null; }

export function MeetingEditor({ meeting, currentUserId, canDelete, onDeleted, compact = false }: { meeting: MeetingRecord; currentUserId: string; canDelete: boolean; onDeleted?: () => void; compact?: boolean }) {
  const { firebaseUser } = useAuth();
  const [title, setTitle] = useState(meeting.title);
  const [notes, setNotes] = useState(meeting.notes);
  const [transcript, setTranscript] = useState(meeting.transcript);
  const [status, setStatus] = useState<MeetingStatus>(meeting.status);
  const [date, setDate] = useState(dateInput(meeting.startAt));
  const [startTime, setStartTime] = useState(timeInput(meeting.startAt));
  const [endTime, setEndTime] = useState(timeInput(meeting.endAt));
  const [location, setLocation] = useState(meeting.location);
  const [meetingUrl, setMeetingUrl] = useState(meeting.meetingUrl);
  const [participantIds, setParticipantIds] = useState(meeting.participantIds);
  const [users, setUsers] = useState<ProveItUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPeople() {
      try {
        const allUsers = await getUsers();
        const memberships = meeting.workspaceId === "company" ? [] : await getMembershipsForWorkspace(meeting.workspaceId);
        const eligible = eligibleWorkspaceUsers(allUsers, meeting.workspaceId, new Set(memberships.map((membership) => membership.userId)));
        const preserved = allUsers.filter((user) => meeting.participantIds.includes(user.uid) && !eligible.some((eligibleUser) => eligibleUser.uid === user.uid));
        if (!cancelled) setUsers([...eligible, ...preserved].sort((left, right) => left.name.localeCompare(right.name)));
      } catch {
        if (!cancelled) setError("Meeting participants could not be loaded.");
      }
    }
    loadPeople();
    return () => { cancelled = true; };
  }, [meeting.id, meeting.participantIds, meeting.workspaceId]);

  async function save() {
    const startAt = combine(date, startTime);
    const endAt = combine(date, endTime);
    const validation = validateMeetingDraft({ title, date, startTime, endTime, meetingUrl, participantIds, allowedParticipantIds: new Set(users.map((user) => user.uid)) });
    if (validation) { setError(validation); return; }
    try {
      setSaving(true); setError("");
      if (!firebaseUser) throw new Error("Authentication required.");
      const response = await authenticatedRequest(firebaseUser, `/api/workspaces/${encodeURIComponent(meeting.workspaceId)}/meetings/${encodeURIComponent(meeting.id)}`, {
        method: "PATCH",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), notes, transcript, status, location: location.trim(), meetingUrl: meetingUrl.trim(), participantIds,
          startAt: startAt?.toISOString() ?? null, endAt: endAt?.toISOString() ?? null,
        }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Meeting changes could not be saved.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Meeting changes could not be saved."); } finally { setSaving(false); }
  }

  async function remove() {
    try { setSaving(true); setError(""); await deleteDoc(doc(db, "meetings", meeting.id)); onDeleted?.(); }
    catch { setError("Meeting could not be deleted. Only BOD administrators can delete meetings."); }
    finally { setSaving(false); setConfirmDelete(false); }
  }

  return <div className={compact ? "" : "pb-10"}>
    {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
    <div className="flex items-start justify-between gap-3"><RecordTitle ariaLabel="Meeting title" value={title} onChange={setTitle} /><button onClick={save} disabled={saving} className="proveit-primary-button mt-9 shrink-0 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></div>
    <RecordProperties>
      <RecordProperty label="Status" icon="◉"><select aria-label="Meeting status" value={status} onChange={(event) => setStatus(event.target.value as MeetingStatus)} className="proveit-control px-2 py-1 text-sm">{meetingStatuses.map((value) => <option key={value} value={value}>{meetingStatusLabel(value)}</option>)}</select></RecordProperty>
      <RecordProperty label="Schedule" icon="◷"><div className="grid min-w-0 gap-2 sm:grid-cols-3"><label className="min-w-0 text-xs text-[var(--muted)]">Date<input aria-label="Meeting date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="proveit-control mt-1 w-full min-w-0 px-2 py-1.5 text-sm text-[var(--text)]" /></label><label className="min-w-0 text-xs text-[var(--muted)]">Start<input aria-label="Meeting start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="proveit-control mt-1 w-full min-w-0 px-2 py-1.5 text-sm text-[var(--text)]" /></label><label className="min-w-0 text-xs text-[var(--muted)]">End<input aria-label="Meeting end time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="proveit-control mt-1 w-full min-w-0 px-2 py-1.5 text-sm text-[var(--text)]" /></label></div></RecordProperty>
      <RecordProperty label="Participants" icon="◉"><EmployeeMultiPicker label="Meeting participants" users={users} value={participantIds} onChange={setParticipantIds} disabled={saving} /></RecordProperty>
      <RecordProperty label="Location or link" icon="⌁"><div className="grid gap-2 sm:grid-cols-2"><input aria-label="Meeting location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="proveit-control px-2 py-1 text-sm" /><input aria-label="Meeting URL" type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://" className="proveit-control px-2 py-1 text-sm" /></div></RecordProperty>
      <RecordProperty label="Organizer" icon="⚑">{users.find((user) => user.uid === meeting.organizerId)?.name || (meeting.organizerId === currentUserId ? "You" : "Former organizer")}</RecordProperty>
    </RecordProperties>
    <RecordContentSection title="Notes" description="Add an agenda, summary, decisions, and action items."><textarea aria-label="Meeting notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agenda\n\nNotes and decisions" className="min-h-48 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[var(--subtle)] hover:bg-[var(--hover)] focus:bg-[var(--input)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]/35" /></RecordContentSection>
    <RecordContentSection title="Human-editable transcript" description="Paste or edit a transcript here. Audio transcription and AI output stay preserved separately below."><textarea aria-label="Transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or edit a transcript here…" className="min-h-48 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[var(--subtle)] hover:bg-[var(--hover)] focus:bg-[var(--input)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]/35" /></RecordContentSection>
    <MeetingExecutionPanel workspaceId={meeting.workspaceId} meetingId={meeting.id} users={users} />
    {!compact && <Comments workspaceId={meeting.workspaceId} entityType="meeting" entityId={meeting.id} />}
    {canDelete && <section className="mt-9 border-t border-[var(--border)] pt-6"><button type="button" onClick={() => setConfirmDelete(true)} className="proveit-secondary-button text-[var(--danger)]">Delete meeting</button></section>}
    <ConfirmDialog open={confirmDelete} title="Delete meeting?" description="This will permanently delete this meeting." confirmLabel="Delete meeting" loading={saving} error={error} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
    {compact && <Link href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`} className="proveit-secondary-button mt-6">↗ Expand meeting</Link>}
  </div>;
}
