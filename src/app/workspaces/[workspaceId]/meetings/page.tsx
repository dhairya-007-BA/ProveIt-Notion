"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { MeetingEditor } from "@/components/meetings/meeting-editor";
import { NewMeetingForm } from "@/components/meetings/new-meeting-form";
import { db } from "@/lib/firebase";
import { getUsers } from "@/lib/users";
import { meetingFromFirestore, meetingParticipantNames, meetingStatusLabel, MeetingRecord } from "@/lib/meetings";
import { ProveItUser } from "@/types/user";

type Filter = "all" | "upcoming" | "past" | "mine";
const isPast = (meeting: MeetingRecord) => Boolean(meeting.startAt && meeting.startAt.getTime() < Date.now());
const meetingTime = (meeting: MeetingRecord) => meeting.startAt?.toLocaleString() || "Unscheduled";

function MeetingRow({ meeting, attendeeNames, onOpen }: { meeting: MeetingRecord; attendeeNames: string[]; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="proveit-list-row flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 text-left last:border-0 hover:bg-[var(--hover)] sm:px-5"><span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--sidebar)] text-[var(--secondary)]">◷</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{meeting.title}</p><p className="mt-1 truncate text-xs text-[var(--muted)]">{meetingTime(meeting)}{attendeeNames.length ? ` · ${attendeeNames.join(", ")}` : " · No attendees"}</p></div><span className={`proveit-status-badge shrink-0 proveit-status-${meeting.status}`}>{meetingStatusLabel(meeting.status)}</span></button>;
}

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getClientRects().length > 0);
}

function SideSheet({ title, onClose, children, width = "max-w-[620px]", actions }: { title: string; onClose: () => void; children: ReactNode; width?: string; actions?: ReactNode }) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      const autofocus = sheetRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      const firstFocusable = sheetRef.current ? focusableElements(sheetRef.current)[0] : null;
      (autofocus || firstFocusable)?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => returnTarget?.focus());
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab" || !sheetRef.current) return;
    const focusable = focusableElements(sheetRef.current);
    if (!focusable.length) { event.preventDefault(); sheetRef.current.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={handleKeyDown} className={`flex h-[100dvh] w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] ${width}`}>
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        {actions}
        <button type="button" aria-label={`Close ${title.toLocaleLowerCase()}`} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl leading-none text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><span aria-hidden="true">×</span></button>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  </div>;
}

export default function MeetingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, profile, loading } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [users, setUsers] = useState<ProveItUser[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
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
  useEffect(() => { let cancelled = false; if (!firebaseUser || !profile) return; void getUsers().then((next) => { if (!cancelled) setUsers(next); }).catch(() => { if (!cancelled) setError("Meeting attendees could not be loaded."); }); return () => { cancelled = true; }; }, [firebaseUser, profile]);

  if (loading || (!profile && firebaseUser)) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading meetings…</main>;
  if (!firebaseUser || !profile) return null;
  const canDelete = profile.group === "bod";
  const attendeeNames = new Map(meetings.map((meeting) => [meeting.id, meetingParticipantNames(meeting, users)]));
  const visible = meetings.filter((meeting) => {
    const haystack = [meeting.title, meeting.notes, ...(attendeeNames.get(meeting.id) || [])].join(" ").toLocaleLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLocaleLowerCase())) return false;
    if (filter === "upcoming") return !isPast(meeting) && meeting.status !== "cancelled";
    if (filter === "past") return isPast(meeting) || meeting.status === "completed" || meeting.status === "cancelled";
    return filter !== "mine" || meeting.organizerId === firebaseUser.uid || meeting.participantIds.includes(firebaseUser.uid);
  });
  const upcoming = visible.filter((meeting) => !isPast(meeting) && meeting.status !== "cancelled");
  const past = visible.filter((meeting) => !upcoming.includes(meeting));
  const open = (meetingId: string) => router.push(`/workspaces/${workspaceId}/meetings?meeting=${meetingId}`);
  const section = (label: string, entries: MeetingRecord[], empty: string) => <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"><header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 sm:px-5"><h2 className="proveit-section-title text-sm">{label}</h2><span className="text-xs text-[var(--muted)]">{entries.length}</span></header>{entries.length ? entries.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} attendeeNames={attendeeNames.get(meeting.id) || []} onOpen={() => open(meeting.id)} />) : <p className="px-5 py-8 text-sm text-[var(--muted)]">{empty}</p>}</section>;

  return <main className="flex min-h-screen bg-[var(--background)]">
    <Sidebar />
    <section className="proveit-content">
      <div className="mx-auto max-w-6xl">
        <Link href={`/workspaces/${workspaceId}`} className="proveit-back-link px-1">← Back to workspace</Link>
        <header className="proveit-page-header mb-6">
          <div><p className="proveit-label">{workspaceId} workspace</p><h1 className="proveit-page-title mt-1">Meetings</h1><p className="mt-3 text-sm text-[var(--muted)]">Plan, run, and capture the conversations that move work forward.</p></div>
          <button type="button" onClick={() => setCreating(true)} className="proveit-primary-button">+ New meeting</button>
        </header>
        {error && <p role="alert" className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search meetings</span><input aria-label="Search meetings" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search meetings, notes, or attendees" className="proveit-control w-full px-3 py-2 pr-9" />{search && <button type="button" aria-label="Clear meeting search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded text-[var(--muted)] hover:bg-[var(--hover)]">×</button>}</label>
          <div className="flex flex-wrap gap-1" aria-label="Meeting filters">{(["all", "upcoming", "past", "mine"] as Filter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-2 text-sm capitalize transition ${filter === value ? "bg-[var(--selected)] font-medium text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--hover)]"}`}>{value === "all" ? "All" : value === "mine" ? "My meetings" : value}</button>)}</div>
        </div>
        {filter === "all" ? <div className="grid gap-6 lg:grid-cols-2">{section("Upcoming", upcoming, search ? "No upcoming meetings match your search." : "No upcoming meetings. Create one when you are ready.")}{section("Past", past, search ? "No past meetings match your search." : "No past meetings yet.")}</div> : section(filter === "mine" ? "My meetings" : filter === "upcoming" ? "Upcoming meetings" : "Past meetings", visible, "No meetings match this view.")}
      </div>
      {selected && <SideSheet key={selected.id} title="Meeting details" onClose={() => router.push(`/workspaces/${workspaceId}/meetings`)} actions={<Link href={`/workspaces/${workspaceId}/meetings/${selected.id}`} className="proveit-secondary-button hidden sm:inline-flex">Open full page</Link>}>
        <aside aria-label="Meeting detail pane" className="h-full overflow-y-auto px-4 py-5 sm:px-6"><MeetingEditor meeting={selected} currentUserId={firebaseUser.uid} canDelete={canDelete} compact onDeleted={() => router.push(`/workspaces/${workspaceId}/meetings`)} /></aside>
      </SideSheet>}
      {creating && <SideSheet title="New meeting" width="max-w-xl" onClose={() => setCreating(false)}>
        <div aria-label="New meeting panel" className="h-full"><NewMeetingForm workspaceId={workspaceId} currentUserId={firebaseUser.uid} onCancel={() => setCreating(false)} onCreated={(meetingId) => { setCreating(false); open(meetingId); }} /></div>
      </SideSheet>}
    </section>
  </main>;
}
