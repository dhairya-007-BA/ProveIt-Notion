"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Comments } from "@/components/comments";
import { RecordDetailShell, RecordProperties, RecordProperty, RecordTitle } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";
import { controlClassName } from "@/components/ui/form-control";

type PropertyType = "title" | "text" | "number" | "select" | "date" | "checkbox" | "url" | "email" | "phone";
type SelectOption = { id: string; name: string };
type Property = { id: string; name: string; type: PropertyType; options?: SelectOption[] };
type DatabaseData = { name?: string; workspaceId?: string; properties?: Property[] };
type RowData = { values?: Record<string, string | number | boolean | null> };

export default function RowPage() {
  const { workspaceId, databaseId, rowId } = useParams<{ workspaceId: string; databaseId: string; rowId: string }>();
  const [database, setDatabase] = useState<DatabaseData | null>(null); const [row, setRow] = useState<RowData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { async function loadData() { try { setLoading(true); const [databaseSnapshot, rowSnapshot] = await Promise.all([getDoc(doc(db, "databases", databaseId)), getDoc(doc(db, "databases", databaseId, "rows", rowId))]); if (!databaseSnapshot.exists()) { setError("Database not found"); return; } if (databaseSnapshot.data().workspaceId !== workspaceId) { setError("This database does not belong to this workspace."); return; } if (!rowSnapshot.exists()) { setError("Row not found"); return; } setDatabase(databaseSnapshot.data() as DatabaseData); setRow(rowSnapshot.data() as RowData); } catch (loadError) { console.error("Could not load row:", loadError); setError("Could not load row"); } finally { setLoading(false); } } loadData(); }, [databaseId, rowId, workspaceId]);
  async function updateValue(propertyId: string, value: string | number | boolean | null) { if (!row) return; const previous = row; setRow({ ...row, values: { ...(row.values ?? {}), [propertyId]: value } }); try { await updateDoc(doc(db, "databases", databaseId, "rows", rowId), { [`values.${propertyId}`]: value, updatedAt: serverTimestamp() }); } catch (saveError) { console.error("Could not update value:", saveError); setRow(previous); setError("Could not save value"); } }
  if (loading) return <main className="grid min-h-screen place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">Loading row…</main>;
  if (error || !row || !database) return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-sm text-[var(--danger)]"><p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-4 py-3">{error || "Row not found"}</p></main>;
  const values = row.values ?? {}; const title = typeof values.title === "string" ? values.title : "";
  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/databases/${databaseId}`} backLabel={database.name || "Database"}>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
    <RecordTitle ariaLabel="Row title" value={title} onChange={(value) => setRow({ ...row, values: { ...values, title: value } })} onBlur={(value) => updateValue("title", value.trim() || "Untitled")} />
    <RecordProperties>{(database.properties ?? []).filter((property) => property.id !== "title" && property.type !== "title").map((property) => <RecordProperty key={property.id} label={property.name} icon={propertyIcon(property.type)}><PropertyEditor property={property} value={values[property.id]} onChange={(value) => updateValue(property.id, value)} /></RecordProperty>)}</RecordProperties>
    <Comments workspaceId={workspaceId} entityType="database-row" entityId={`${databaseId}:${rowId}`} />
  </RecordDetailShell>;
}

function propertyIcon(type: PropertyType) { return ({ text: "≡", number: "#", select: "◉", date: "□", checkbox: "☑", url: "↗", email: "@", phone: "☎", title: "T" } as Record<PropertyType, string>)[type]; }

function PropertyEditor({ property, value, onChange }: { property: Property; value: string | number | boolean | null | undefined; onChange: (value: string | number | boolean | null) => void }) {
  const controlClass = `${controlClassName} w-full px-2 py-1.5 text-sm`;
  if (property.type === "checkbox") return <input aria-label={property.name} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" />;
  if (property.type === "select") { const selected = typeof value === "string" ? value : ""; const options = property.options || []; const known = options.some((option) => option.id === selected); return <select aria-label={property.name} value={selected} onChange={(event) => onChange(event.target.value)} className={controlClass}><option value="">Empty</option>{selected && !known && <option value={selected}>{`Legacy: ${selected}`}</option>}{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>; }
  const type = property.type === "number" ? "number" : property.type === "date" ? "date" : property.type === "email" ? "email" : property.type === "url" ? "url" : property.type === "phone" ? "tel" : "text";
  const displayValue = value === undefined || value === null ? "" : String(value);
  return <input aria-label={property.name} type={type} value={displayValue} placeholder="Empty" onChange={(event) => { const raw = event.target.value; onChange(property.type === "number" ? (raw === "" ? null : Number(raw)) : raw); }} className={controlClass} />;
}
