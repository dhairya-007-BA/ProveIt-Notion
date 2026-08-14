"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { db } from "@/lib/firebase";

type SearchKind = "task" | "meeting" | "document" | "database" | "database-row";
type SearchResult = { id: string; kind: SearchKind; title: string; context: string; workspaceId: string; workspaceName: string; href: string; haystack: string };
const icons: Record<SearchKind, string> = { task: "✓", meeting: "◷", document: "▤", database: "▦", "database-row": "↗" };
const labels: Record<SearchKind, string> = { task: "Tasks", meeting: "Meetings", document: "Documents", database: "Databases", "database-row": "Database rows" };

function stringValue(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }

export function GlobalSearch() {
  const { firebaseUser, profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true); }
      if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); }
    }
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); else returnFocus.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open || !firebaseUser || !profile) return;
    const currentProfile = profile;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const workspaces = await getAccessibleWorkspaces(currentProfile);
        const ids = workspaces.map((workspace) => workspace.id);
        if (!ids.length) return;
        const names = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
        const [tasks, meetings, documents, databases] = await Promise.all(["tasks", "meetings", "documents", "databases"].map((name) => getDocs(query(collection(db, name), where("workspaceId", "in", ids)))));
        const mapped: SearchResult[] = [];
        tasks.docs.forEach((item) => { const value = item.data(); mapped.push({ id: item.id, kind: "task", title: stringValue(value.title) || "Untitled task", context: `${stringValue(value.status) || "Not started"} · ${stringValue(value.priority) || "medium"} priority`, workspaceId: stringValue(value.workspaceId), workspaceName: names.get(stringValue(value.workspaceId)) || "Workspace", href: `/workspaces/${value.workspaceId}/tasks/${item.id}`, haystack: [value.title, value.description, value.status, value.priority].map(stringValue).join(" ") }); });
        meetings.docs.forEach((item) => { const value = item.data(); mapped.push({ id: item.id, kind: "meeting", title: stringValue(value.title) || "Untitled meeting", context: stringValue(value.status) || "Scheduled", workspaceId: stringValue(value.workspaceId), workspaceName: names.get(stringValue(value.workspaceId)) || "Workspace", href: `/workspaces/${value.workspaceId}/meetings/${item.id}`, haystack: [value.title, value.notes, value.status, value.location].map(stringValue).join(" ") }); });
        documents.docs.forEach((item) => { const value = item.data(); mapped.push({ id: item.id, kind: "document", title: stringValue(value.title) || "Untitled document", context: "Document", workspaceId: stringValue(value.workspaceId), workspaceName: names.get(stringValue(value.workspaceId)) || "Workspace", href: `/workspaces/${value.workspaceId}/documents/${item.id}`, haystack: [value.title, value.content].map(stringValue).join(" ") }); });
        databases.docs.forEach((item) => { const value = item.data(); const workspaceId = stringValue(value.workspaceId); mapped.push({ id: item.id, kind: "database", title: stringValue(value.name) || "Untitled database", context: "Database", workspaceId, workspaceName: names.get(workspaceId) || "Workspace", href: `/workspaces/${workspaceId}/databases/${item.id}`, haystack: [value.name, value.description].map(stringValue).join(" ") }); });
        const rowSnapshots = await Promise.all(databases.docs.map((database) => getDocs(collection(db, "databases", database.id, "rows"))));
        rowSnapshots.forEach((snapshot, index) => { const database = databases.docs[index]; const data = database.data(); const workspaceId = stringValue(data.workspaceId); const props = Array.isArray(data.properties) ? data.properties : []; snapshot.docs.forEach((row) => { const values = row.data().values || {}; const textValues = props.filter((property) => ["title", "text", "email", "url", "phone"].includes(property.type)).map((property) => stringValue(values[property.id])); const title = textValues[0] || "Untitled row"; mapped.push({ id: row.id, kind: "database-row", title, context: stringValue(data.name) || "Database row", workspaceId, workspaceName: names.get(workspaceId) || "Workspace", href: `/workspaces/${workspaceId}/databases/${database.id}/rows/${row.id}`, haystack: textValues.join(" ") }); }); });
        if (!cancelled) setResults(mapped);
      } finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [open, firebaseUser, profile]);

  const visible = useMemo(() => {
    const needle = queryText.trim().toLocaleLowerCase(); if (!needle) return [];
    return results.filter((result) => result.haystack.toLocaleLowerCase().includes(needle)).sort((left, right) => { const score = (item: SearchResult) => item.title.toLocaleLowerCase() === needle ? 0 : item.title.toLocaleLowerCase().startsWith(needle) ? 1 : item.title.toLocaleLowerCase().includes(needle) ? 2 : 3; return score(left) - score(right) || left.title.localeCompare(right.title); });
  }, [queryText, results]);
  const openResult = (result: SearchResult) => { setOpen(false); router.push(result.href); };
  const groups = Object.entries(labels).map(([kind, label]) => [kind as SearchKind, label, visible.filter((result) => result.kind === kind as SearchKind)] as const).filter(([, , items]) => items.length);

  if (!open) return null;
  return <div role="dialog" aria-modal="true" aria-label="Search ProveIt" className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/20 px-4 py-[10vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]"><div className="flex items-center border-b border-[var(--border)] px-4"><span aria-hidden className="text-[var(--subtle)]">⌕</span><input autoFocus ref={inputRef} aria-label="Search ProveIt" value={queryText} onChange={(event) => { setQueryText(event.target.value); setSelected(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(value + 1, visible.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)); } if (event.key === "Enter" && visible[selected]) openResult(visible[selected]); }} placeholder="Search ProveIt…" className="h-14 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-[var(--subtle)]" /><kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--subtle)]">Esc</kbd></div><div data-testid="search-results" className="max-h-[65vh] overflow-y-auto p-2">{loading && <p className="px-3 py-8 text-sm text-[var(--muted)]">Searching accessible workspaces…</p>}{!loading && !queryText.trim() && <p className="px-3 py-8 text-sm text-[var(--muted)]">Type to search tasks, meetings, documents, databases, and database rows.</p>}{!loading && queryText.trim() && groups.length === 0 && <p className="px-3 py-8 text-sm text-[var(--muted)]">No results found.</p>}{groups.map(([kind, label, items]) => <section key={kind} className="mb-3 last:mb-0"><p className="proveit-label px-2 py-1.5">{label}</p>{items.map((item) => { const index = visible.indexOf(item); return <button key={`${item.kind}-${item.id}`} onMouseEnter={() => setSelected(index)} onClick={() => openResult(item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${selected === index ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]"}`}><span aria-hidden className="grid h-8 w-8 place-items-center rounded-md bg-[var(--sidebar)] text-sm">{icons[item.kind]}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{item.context} · {item.workspaceName}</span></span></button>; })}</section>)}</div></div></div>;
}
