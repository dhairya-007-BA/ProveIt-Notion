"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { db } from "@/lib/firebase";

type SearchKind = "task" | "meeting" | "document" | "database" | "database-row";
type SearchFilter = "all" | SearchKind;
type SearchResult = { id: string; kind: SearchKind; title: string; context: string; workspaceId: string; workspaceName: string; href: string; haystack: string };

const labels: Record<SearchKind, string> = { task: "Tasks", meeting: "Meetings", document: "Documents", database: "Databases", "database-row": "Database rows" };
const initialSearchKinds: SearchKind[] = ["task", "document", "meeting", "database", "database-row"];
const filterKinds: SearchFilter[] = ["all", ...initialSearchKinds];

function stringValue(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }

function SearchIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5" /><path strokeLinecap="round" d="m16 16 4 4" /></svg>;
}

function CloseIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13m-5-5 5 5-5 5" /></svg>;
}

function ResultIcon({ kind }: { kind: SearchKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "task") return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
  if (kind === "meeting") return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="7" /><path d="M12 8v4l2.8 1.8M8 3v3M16 3v3" /></svg>;
  if (kind === "document") return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}><path d="M7 3.5h7l3 3V20.5H7z" /><path d="M14 3.5v3h3M10 11h4M10 15h4" /></svg>;
  if (kind === "database") return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}><ellipse cx="12" cy="6" rx="6.5" ry="2.8" /><path d="M5.5 6v6c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V6M5.5 12v6c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-6" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}><path d="M5 4.5h14v15H5zM5 10h14M10 4.5v15" /><path d="m13 14 4-4M14 10h3v3" /></svg>;
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-sans text-[10px] font-medium text-[var(--subtle)]">{children}</kbd>;
}

function Highlight({ value, queryText }: { value: string; queryText: string }) {
  const query = queryText.trim();
  if (!query) return <>{value}</>;
  const index = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return <>{value}</>;
  return <>{value.slice(0, index)}<mark className="rounded-sm bg-[var(--selected)] px-px font-semibold text-[var(--text)]">{value.slice(index, index + query.length)}</mark>{value.slice(index + query.length)}</>;
}

export function GlobalSearch() {
  const { firebaseUser, profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
      }
      if (event.key === "Escape" && open) { event.preventDefault(); close(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
    else returnFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !firebaseUser || !profile) return;
    const currentProfile = profile;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setLoadError(false);
        const workspaces = await getAccessibleWorkspaces(currentProfile);
        const ids = workspaces.map((workspace) => workspace.id);
        if (!ids.length) { if (!cancelled) setResults([]); return; }
        const names = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
        const [tasks, meetings, documents, databases] = await Promise.all(["tasks", "meetings", "documents", "databases"].map((name) => getDocs(query(collection(db, name), where("workspaceId", "in", ids)))));
        const mapped: SearchResult[] = [];
        tasks.docs.forEach((item) => {
          const value = item.data();
          mapped.push({ id: item.id, kind: "task", title: stringValue(value.title) || "Untitled task", context: `${stringValue(value.status) || "Not started"} · ${stringValue(value.priority) || "medium"} priority`, workspaceId: stringValue(value.workspaceId), workspaceName: names.get(stringValue(value.workspaceId)) || "Workspace", href: `/workspaces/${value.workspaceId}/tasks/${item.id}`, haystack: [value.title, value.description, value.status, value.priority].map(stringValue).join(" ") });
        });
        meetings.docs.forEach((item) => {
          const value = item.data();
          mapped.push({ id: item.id, kind: "meeting", title: stringValue(value.title) || "Untitled meeting", context: stringValue(value.status) || "Scheduled", workspaceId: stringValue(value.workspaceId), workspaceName: names.get(stringValue(value.workspaceId)) || "Workspace", href: `/workspaces/${value.workspaceId}/meetings/${item.id}`, haystack: [value.title, value.notes, value.status, value.location].map(stringValue).join(" ") });
        });
        documents.docs.forEach((item) => {
          const value = item.data();
          mapped.push({ id: item.id, kind: "document", title: stringValue(value.title) || "Untitled document", context: "Document", workspaceId: stringValue(value.workspaceId), workspaceName: names.get(stringValue(value.workspaceId)) || "Workspace", href: `/workspaces/${value.workspaceId}/documents/${item.id}`, haystack: [value.title, value.content].map(stringValue).join(" ") });
        });
        databases.docs.forEach((item) => {
          const value = item.data();
          const workspaceId = stringValue(value.workspaceId);
          mapped.push({ id: item.id, kind: "database", title: stringValue(value.name) || "Untitled database", context: "Database", workspaceId, workspaceName: names.get(workspaceId) || "Workspace", href: `/workspaces/${workspaceId}/databases/${item.id}`, haystack: [value.name, value.description].map(stringValue).join(" ") });
        });
        const rowSnapshots = await Promise.all(databases.docs.map((database) => getDocs(collection(db, "databases", database.id, "rows"))));
        rowSnapshots.forEach((snapshot, index) => {
          const database = databases.docs[index];
          const data = database.data();
          const workspaceId = stringValue(data.workspaceId);
          const properties = Array.isArray(data.properties) ? data.properties : [];
          snapshot.docs.forEach((row) => {
            const values = row.data().values || {};
            const textValues = properties.filter((property) => ["title", "text", "email", "url", "phone"].includes(property.type)).map((property) => stringValue(values[property.id]));
            const title = textValues[0] || "Untitled row";
            mapped.push({ id: row.id, kind: "database-row", title, context: stringValue(data.name) || "Database row", workspaceId, workspaceName: names.get(workspaceId) || "Workspace", href: `/workspaces/${workspaceId}/databases/${database.id}/rows/${row.id}`, haystack: textValues.join(" ") });
          });
        });
        if (!cancelled) setResults(mapped);
      } catch {
        if (!cancelled) { setResults([]); setLoadError(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, firebaseUser, profile]);

  const visible = useMemo(() => {
    const needle = queryText.trim().toLocaleLowerCase();
    if (!needle) return [];
    return results.filter((result) => (activeFilter === "all" || result.kind === activeFilter) && result.haystack.toLocaleLowerCase().includes(needle)).sort((left, right) => {
      const score = (item: SearchResult) => item.title.toLocaleLowerCase() === needle ? 0 : item.title.toLocaleLowerCase().startsWith(needle) ? 1 : item.title.toLocaleLowerCase().includes(needle) ? 2 : 3;
      return score(left) - score(right) || left.title.localeCompare(right.title);
    });
  }, [activeFilter, queryText, results]);

  const groups = Object.entries(labels).map(([kind, label]) => [kind as SearchKind, label, visible.filter((result) => result.kind === kind)] as const).filter(([, , items]) => items.length);
  const openResult = (result: SearchResult) => { close(); router.push(result.href); };
  const initial = !queryText.trim();
  const currentSelected = Math.min(selected, Math.max(visible.length - 1, 0));

  useEffect(() => { if (open && visible.length) dialogRef.current?.querySelector<HTMLElement>(`#search-result-${currentSelected}`)?.scrollIntoView({ block: "nearest" }); }, [currentSelected, open, visible.length]);

  function selectNext(direction: 1 | -1) {
    if (!visible.length) return;
    setSelected((value) => Math.max(0, Math.min(visible.length - 1, value + direction)));
  }

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); selectNext(1); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); selectNext(-1); return; }
    if (event.key === "Enter" && visible[currentSelected]) { event.preventDefault(); openResult(visible[currentSelected]); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
    if (!focusable.length) return;
    const current = document.activeElement as HTMLElement;
    const index = focusable.indexOf(current);
    const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index === focusable.length - 1 ? 0 : index + 1);
    event.preventDefault();
    focusable[next]?.focus();
  }

  if (!open) return null;

  return <div role="dialog" aria-modal="true" aria-label="Search ProveIt" className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 px-3 pt-4 backdrop-blur-[1px] sm:px-6 sm:pt-[18vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} onKeyDown={trapFocus}>
    <div ref={dialogRef} className="flex w-full max-w-[700px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] sm:max-h-[70vh]">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 sm:px-5">
        <SearchIcon className="h-5 w-5 shrink-0 text-[var(--secondary)]" />
        <input autoFocus ref={inputRef} aria-label="Search ProveIt" aria-controls="proveit-search-results" value={queryText} onChange={(event) => { setQueryText(event.target.value); setSelected(0); }} placeholder="Search ProveIt…" style={{ outline: "none", boxShadow: "none" }} className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--subtle)] focus-visible:bg-[var(--input)] focus-visible:outline-none" />
        <span className="hidden sm:block"><Key>Esc</Key></span>
        <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:hidden" aria-label="Close search"><CloseIcon className="h-5 w-5" /></button>
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border)] px-3 py-2 sm:px-4" aria-label="Search categories">
        {filterKinds.map((filter) => { const selectedFilter = activeFilter === filter; const label = filter === "all" ? "All" : labels[filter]; return <button key={filter} type="button" aria-pressed={selectedFilter} onClick={() => { setActiveFilter(filter); setSelected(0); inputRef.current?.focus(); }} className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${selectedFilter ? "bg-[var(--selected)] text-[var(--secondary)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"}`}>{label}</button>; })}
      </div>
      <div id="proveit-search-results" data-testid="search-results" role="listbox" aria-label="Search results" className="max-h-[calc(85dvh-7.5rem)] overflow-y-auto p-2 sm:max-h-[calc(70vh-7.5rem)]">
        {loading && <div className="flex items-center gap-3 px-3 py-3 text-sm text-[var(--muted)]" aria-label="Searching accessible workspaces"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--secondary)]" />Searching accessible workspaces…</div>}
        {!loading && loadError && <div className="px-4 py-8 text-center"><p className="font-heading text-sm font-semibold text-[var(--text)]">Search couldn&apos;t be completed.</p><p className="mt-1 text-sm text-[var(--muted)]">Try again.</p></div>}
        {!loading && !loadError && initial && <div className="px-3 py-4 sm:px-4"><p className="font-heading text-sm font-semibold text-[var(--text)]">Search ProveIt</p><p className="mt-1 text-sm text-[var(--muted)]">Search across your accessible workspace content.</p><div className="mt-4 flex flex-wrap gap-1.5">{initialSearchKinds.map((kind) => <span key={kind} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs text-[var(--muted)]"><span className="h-3.5 w-3.5 text-[var(--accent)]"><ResultIcon kind={kind} /></span>{labels[kind]}</span>)}</div></div>}
        {!loading && !loadError && !initial && groups.length === 0 && <div className="px-4 py-8 text-center"><p className="font-heading text-sm font-semibold text-[var(--text)]">No results for “{queryText.trim()}”</p><p className="mt-1 text-sm text-[var(--muted)]">Try another keyword or search another workspace.</p></div>}
        {!loading && !loadError && groups.map(([kind, label, items]) => <section key={kind} aria-label={label} className="mb-2 last:mb-0"><p className="proveit-label px-3 pb-1 pt-1.5">{label}</p>{items.map((item) => {
          const index = visible.indexOf(item);
          const isSelected = currentSelected === index;
          return <button key={`${item.kind}-${item.id}`} id={`search-result-${index}`} type="button" role="option" aria-selected={isSelected} aria-label={`${labels[item.kind].slice(0, -1)}: ${item.title}, ${item.workspaceName}`} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => openResult(item)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${isSelected ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${isSelected ? "bg-[var(--surface-elevated)] text-[var(--secondary)]" : "bg-[var(--surface-muted)] text-[var(--accent)]"}`}><ResultIcon kind={item.kind} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[var(--text)]"><Highlight value={item.title} queryText={queryText} /></span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{labels[item.kind].slice(0, -1)} · {item.workspaceName}{item.context ? ` · ${item.context}` : ""}</span></span><span className={`shrink-0 text-[var(--subtle)] transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}><ArrowIcon /></span></button>;
        })}</section>)}
      </div>
      <div className="hidden shrink-0 items-center gap-3 border-t border-[var(--border)] px-5 py-2 text-[11px] text-[var(--subtle)] sm:flex"><span className="inline-flex items-center gap-1"><Key>↑</Key><Key>↓</Key> Navigate</span><span className="inline-flex items-center gap-1"><Key>↵</Key> Open</span><span className="inline-flex items-center gap-1"><Key>Esc</Key> Close</span></div>
    </div>
  </div>;
}
