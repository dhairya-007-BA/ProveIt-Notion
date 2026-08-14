"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";

import { Comments } from "@/components/comments";
import { RecordContentSection, RecordProperties, RecordProperty, RecordTitle } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import { eligibleWorkspaceUsers, meetingParticipantNames, meetingStatusLabel, meetingStatuses, MeetingRecord, MeetingStatus } from "@/lib/meetings";
import { getUsers } from "@/lib/users";
import { ProveItUser } from "@/types/user";

function dateInput(date?: Date) { return date ? date.toISOString().slice(0, 10) : ""; }
function timeInput(date?: Date) { return date ? date.toTimeString().slice(0, 5) : ""; }
function combine(date: string, time: string) { return date ? new Date(`${date}T${time || "12:00"}:00`) : null; }

export function MeetingEditor({ meeting, currentUserId, canDelete, onDeleted, compact = false }: { meeting: MeetingRecord; currentUserId: string; canDelete: boolean; onDeleted?: () => void; compact?: boolean }) {
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
        const preserved = allUsers.filter((user) => participantIds.includes(user.uid) && !eligible.some((eligibleUser) => eligibleUser.uid === user.uid));
        if (!cancelled) setUsers([...eligible, ...preserved].sort((left, right) => left.name.localeCompare(right.name)));
      } catch {
        if (!cancelled) setError("Meeting participants could not be loaded.");
      }
    }
    loadPeople();
    return () => { cancelled = true; };
  }, [meeting.workspaceId, participantIds]);

  const participantNames = useMemo(() => meetingParticipantNames({ ...meeting, participantIds }, users), [meeting, participantIds, users]);

  async function save() {
    const startAt = combine(date, startTime);
    const endAt = combine(date, endTime);
    if (startAt && endAt && endAt < startAt) { setError("End time must be after the start time."); return; }
    try {
      setSaving(true); setError("");
      await updateDoc(doc(db, "meetings", meeting.id), {
        title: title.trim() || "Untitled meeting", notes, transcript, status, location: location.trim(), meetingUrl: meetingUrl.trim(),
        participantIds, organizerId: meeting.organizerId || currentUserId,
        startAt: startAt ? Timestamp.fromDate(startAt) : null, endAt: endAt ? Timestamp.fromDate(endAt) : null,
        updatedAt: serverTimestamp(),
      });
    } catch { setError("Meeting changes could not be saved."); } finally { setSaving(false); }
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
      <RecordProperty label="Date" icon="□"><input aria-label="Meeting date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="proveit-control px-2 py-1 text-sm" /></RecordProperty>
      <RecordProperty label="Start / end" icon="◷"><div className="flex flex-wrap items-center gap-2"><input aria-label="Meeting start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="proveit-control px-2 py-1 text-sm" /><span className="text-[var(--subtle)]">to</span><input aria-label="Meeting end time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="proveit-control px-2 py-1 text-sm" /></div></RecordProperty>
      <RecordProperty label="Participants" icon="◉"><div><select aria-label="Meeting participants" multiple value={participantIds} onChange={(event) => setParticipantIds(Array.from(event.target.selectedOptions, (option) => option.value))} className="proveit-control min-h-24 w-full px-2 py-1 text-sm">{users.map((user) => <option key={user.uid} value={user.uid}>{user.name}</option>)}</select><p className="mt-1 text-xs text-[var(--muted)]">{participantNames.length ? participantNames.join(", ") : "No participants selected"}</p></div></RecordProperty>
      <RecordProperty label="Location or link" icon="⌁"><div className="grid gap-2 sm:grid-cols-2"><input aria-label="Meeting location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="proveit-control px-2 py-1 text-sm" /><input aria-label="Meeting URL" type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://" className="proveit-control px-2 py-1 text-sm" /></div></RecordProperty>
      <RecordProperty label="Organizer" icon="⚑">{users.find((user) => user.uid === meeting.organizerId)?.name || (meeting.organizerId === currentUserId ? "You" : "Former organizer")}</RecordProperty>
    </RecordProperties>
    <RecordContentSection title="Notes" description="Add an agenda, summary, decisions, and action items."><textarea aria-label="Meeting notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agenda\n\nNotes and decisions" className="min-h-48 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[var(--subtle)] hover:bg-[var(--hover)] focus:bg-white focus-visible:ring-2 focus-visible:ring-[var(--focus)]/35" /></RecordContentSection>
    <RecordContentSection title="Transcript" description="Paste or edit a transcript. Upload and transcription remain intentionally unconfigured."><textarea aria-label="Transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or edit a transcript here…" className="min-h-48 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[var(--subtle)] hover:bg-[var(--hover)] focus:bg-white focus-visible:ring-2 focus-visible:ring-[var(--focus)]/35" /></RecordContentSection>
    {!compact && <Comments workspaceId={meeting.workspaceId} entityType="meeting" entityId={meeting.id} />}
    {canDelete && <section className="mt-9 border-t border-[var(--border)] pt-6"><button onClick={() => setConfirmDelete(true)} className="proveit-secondary-button text-[var(--danger)]">Delete meeting</button>{confirmDelete && <div role="dialog" aria-modal="true" aria-label="Confirm meeting deletion" className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]"><p className="text-sm font-medium">Delete this meeting?</p><p className="mt-1 text-sm text-[var(--muted)]">This cannot be undone. Only a BOD administrator can complete deletion.</p><div className="mt-4 flex gap-2"><button onClick={remove} disabled={saving} className="proveit-primary-button bg-[var(--danger)]">Delete meeting</button><button onClick={() => setConfirmDelete(false)} className="proveit-secondary-button">Cancel</button></div></div>}</section>}
    {compact && <Link href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`} className="proveit-secondary-button mt-6">↗ Expand meeting</Link>}
  </div>;
}
