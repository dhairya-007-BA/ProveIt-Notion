"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { eligibleWorkspaceUsers, meetingParticipantNames, validateMeetingDraft } from "@/lib/meetings";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import { getUsers } from "@/lib/users";
import { ProveItUser } from "@/types/user";

function dateTime(date: string, time: string) {
  return date ? new Date(`${date}T${time || "12:00"}:00`) : null;
}

export function NewMeetingForm({ workspaceId, currentUserId, onCancel, onCreated }: { workspaceId: string; currentUserId: string; onCancel: () => void; onCreated: (meetingId: string) => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [users, setUsers] = useState<ProveItUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPeople() {
      try {
        const allUsers = await getUsers();
        const memberships = workspaceId === "company" ? [] : await getMembershipsForWorkspace(workspaceId);
        if (!cancelled) setUsers(eligibleWorkspaceUsers(allUsers, workspaceId, new Set(memberships.map((membership) => membership.userId))));
      } catch { if (!cancelled) setError("Meeting participants could not be loaded."); }
    }
    void loadPeople();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const attendeeNames = useMemo(() => meetingParticipantNames({ participantIds }, users), [participantIds, users]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validation = validateMeetingDraft({ title, date, startTime, endTime, meetingUrl, participantIds, allowedParticipantIds: new Set(users.map((user) => user.uid)) });
    if (validation) { setError(validation); return; }
    try {
      setSaving(true); setError("");
      const startAt = dateTime(date, startTime);
      const endAt = dateTime(date, endTime);
      const ref = await addDoc(collection(db, "meetings"), {
        title: title.trim(), workspaceId, createdBy: currentUserId, organizerId: currentUserId,
        participantIds, status: "scheduled", notes: notes.trim(), transcript: "", location: location.trim(), meetingUrl: meetingUrl.trim(),
        startAt: startAt ? Timestamp.fromDate(startAt) : null, endAt: endAt ? Timestamp.fromDate(endAt) : null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      onCreated(ref.id);
    } catch { setError("Meeting could not be created."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="flex h-full flex-col">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div className="min-w-0"><p className="proveit-label">{workspaceId} workspace</p><h2 className="proveit-heading mt-1 text-xl font-semibold">New meeting</h2></div><button type="button" onClick={onCancel} disabled={saving} aria-label="Close new meeting" className="proveit-secondary-button shrink-0 disabled:opacity-50">Close <span aria-hidden="true">×</span></button></header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
      {error && <p role="alert" className="rounded-lg border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
      <label className="block text-sm font-medium">Title<input aria-label="Meeting title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What is this meeting about?" className="proveit-control mt-1.5 w-full px-3 py-2" /></label>
      <label className="block text-sm font-medium">Agenda / notes<textarea aria-label="Meeting notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agenda, discussion points, or context" className="proveit-control mt-1.5 min-h-28 w-full resize-y px-3 py-2" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Date<input aria-label="Meeting date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="proveit-control mt-1.5 w-full px-3 py-2" /></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-medium">Start<input aria-label="Meeting start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="proveit-control mt-1.5 w-full px-3 py-2" /></label><label className="text-sm font-medium">End<input aria-label="Meeting end time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="proveit-control mt-1.5 w-full px-3 py-2" /></label></div></div>
      <label className="block text-sm font-medium">Attendees<select aria-label="Meeting attendees" multiple value={participantIds} onChange={(event) => setParticipantIds(Array.from(event.target.selectedOptions, (option) => option.value))} className="proveit-control mt-1.5 min-h-28 w-full px-3 py-2">{users.map((user) => <option key={user.uid} value={user.uid}>{user.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[var(--muted)]">{attendeeNames.length ? attendeeNames.join(", ") : "No attendees selected"}</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Location<input aria-label="Meeting location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room or venue" className="proveit-control mt-1.5 w-full px-3 py-2" /></label><label className="text-sm font-medium">Meeting link<input aria-label="Meeting URL" type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://" className="proveit-control mt-1.5 w-full px-3 py-2" /></label></div>
    </div>
    <footer className="flex shrink-0 justify-end gap-3 border-t border-[var(--border)] px-5 py-4"><button type="button" onClick={onCancel} disabled={saving} className="proveit-secondary-button disabled:opacity-50">Cancel</button><button type="submit" disabled={saving} className="proveit-primary-button disabled:opacity-50">{saving ? "Creating…" : "Create meeting"}</button></footer>
  </form>;
}
