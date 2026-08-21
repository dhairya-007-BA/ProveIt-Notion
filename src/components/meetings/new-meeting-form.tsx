"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { EmployeeMultiPicker } from "@/components/people/employee-multi-picker";
import { authenticatedRequest } from "@/lib/authenticated-request";
import { eligibleWorkspaceUsers, validateMeetingDraft } from "@/lib/meetings";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import { getUsers } from "@/lib/users";
import { ProveItUser } from "@/types/user";

function dateTime(date: string, time: string) {
  return date ? new Date(`${date}T${time || "12:00"}:00`) : null;
}

export function NewMeetingForm({ workspaceId, onCancel, onCreated }: { workspaceId: string; currentUserId?: string; onCancel: () => void; onCreated: (meetingId: string) => void }) {
  const { firebaseUser } = useAuth();
  const creationRequestId = useRef(crypto.randomUUID());
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validation = validateMeetingDraft({ title, date, startTime, endTime, meetingUrl, participantIds, allowedParticipantIds: new Set(users.map((user) => user.uid)) });
    if (validation) { setError(validation); return; }
    try {
      setSaving(true); setError("");
      const startAt = dateTime(date, startTime);
      const endAt = dateTime(date, endTime);
      if (!firebaseUser) throw new Error("Authentication required.");
      const response = await authenticatedRequest(firebaseUser, `/api/workspaces/${encodeURIComponent(workspaceId)}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creationRequestId: creationRequestId.current,
          title: title.trim(), participantIds, status: "scheduled", notes: notes.trim(), transcript: "", location: location.trim(), meetingUrl: meetingUrl.trim(),
          startAt: startAt?.toISOString() ?? null, endAt: endAt?.toISOString() ?? null,
        }),
      });
      const body = await response.json().catch(() => null) as { meetingId?: string; message?: string } | null;
      if (!response.ok || !body?.meetingId) throw new Error(body?.message || "Meeting could not be created.");
      onCreated(body.meetingId);
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Meeting could not be created."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      {error && <p role="alert" className="rounded-lg border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
      <section aria-labelledby="meeting-basics-title" className="space-y-4">
        <div><p className="proveit-label">{workspaceId} workspace</p><h3 id="meeting-basics-title" className="mt-1 text-base font-semibold">Meeting details</h3></div>
        <label className="block text-sm font-medium">Title<input data-autofocus aria-label="Meeting title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What is this meeting about?" className="proveit-control mt-1.5 w-full px-3 py-2.5" /></label>
        <label className="block text-sm font-medium">Agenda / notes<textarea aria-label="Meeting notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agenda, discussion points, or context" className="proveit-control mt-1.5 min-h-28 w-full resize-y px-3 py-2.5" /></label>
      </section>
      <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <legend className="px-1 text-sm font-semibold">Schedule</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">Date<input aria-label="Meeting date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="proveit-control mt-1.5 w-full min-w-0 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">Start time<input aria-label="Meeting start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="proveit-control mt-1.5 w-full min-w-0 px-3 py-2.5" /></label>
          <label className="text-sm font-medium">End time<input aria-label="Meeting end time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="proveit-control mt-1.5 w-full min-w-0 px-3 py-2.5" /></label>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Attendees</legend>
        <EmployeeMultiPicker label="Meeting attendees" users={users} value={participantIds} onChange={setParticipantIds} disabled={saving} />
      </fieldset>
      <fieldset className="rounded-xl border border-[var(--border)] p-4">
        <legend className="px-1 text-sm font-semibold">Where to meet</legend>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Location<input aria-label="Meeting location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room or venue" className="proveit-control mt-1.5 w-full px-3 py-2.5" /></label><label className="text-sm font-medium">Meeting link<input aria-label="Meeting URL" type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://" className="proveit-control mt-1.5 w-full px-3 py-2.5" /></label></div>
      </fieldset>
    </div>
    <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><button type="button" onClick={onCancel} disabled={saving} className="proveit-secondary-button w-full disabled:opacity-50 sm:w-auto">Cancel</button><button type="submit" disabled={saving} className="proveit-primary-button w-full disabled:opacity-50 sm:w-auto">{saving ? "Creating…" : "Create meeting"}</button></footer>
  </form>;
}
