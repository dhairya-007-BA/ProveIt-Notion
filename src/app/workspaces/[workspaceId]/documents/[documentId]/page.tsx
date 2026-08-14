"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { Comments } from "@/components/comments";
import { RecordContentSection, RecordDetailShell, RecordProperties, RecordProperty, RecordTitle } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";

export default function DocumentEditorPage() {
  const { workspaceId, documentId } = useParams<{ workspaceId: string; documentId: string }>();
  const router = useRouter(); const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved"); const initialLoadComplete = useRef(false); const skipInitialSave = useRef(false);
  useEffect(() => { if (!authLoading && !firebaseUser) router.replace("/login"); }, [authLoading, firebaseUser, router]);
  useEffect(() => { if (authLoading || !firebaseUser || !profile || !workspaceId || !documentId) return; async function loadDocument() { try { setLoading(true); setError(""); const snapshot = await getDoc(doc(db, "documents", documentId)); if (!snapshot.exists()) { setError("Document could not be found."); return; } const data = snapshot.data(); if (data.workspaceId !== workspaceId) { setError("This document does not belong to this workspace."); return; } skipInitialSave.current = true; setTitle(data.title || "Untitled"); setContent(data.content || ""); initialLoadComplete.current = true; setSaveStatus("saved"); } catch (loadError) { console.error("Failed to load document:", loadError); setError("Document could not be loaded."); } finally { setLoading(false); } } loadDocument(); }, [authLoading, firebaseUser, profile, workspaceId, documentId]);
  useEffect(() => { if (!initialLoadComplete.current || !firebaseUser || !documentId) return; if (skipInitialSave.current) { skipInitialSave.current = false; return; } setSaveStatus("unsaved"); const timeout = window.setTimeout(async () => { try { setSaveStatus("saving"); await updateDoc(doc(db, "documents", documentId), { title: title.trim() || "Untitled", content, updatedAt: serverTimestamp() }); setSaveStatus("saved"); } catch (saveError) { console.error("Failed to save document:", saveError); setSaveStatus("unsaved"); setError("Your latest changes could not be saved."); } }, 700); return () => window.clearTimeout(timeout); }, [title, content, firebaseUser, documentId]);
  if (authLoading || loading) return <main className="grid min-h-screen place-items-center bg-[#fbfbfa] text-sm text-[#787774]">Loading document…</main>;
  if (!firebaseUser || !profile) return null;

  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/documents`} backLabel="Documents" actions={<span className="px-2 py-1 text-xs text-[#9b9a97]">{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Unsaved changes"}</span>}>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <RecordTitle ariaLabel="Document title" value={title} onChange={(value) => { setTitle(value); setError(""); }} />
    <RecordProperties><RecordProperty label="Save status" icon="◷">{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Unsaved changes"}</RecordProperty></RecordProperties>
    <RecordContentSection title="Content"><textarea aria-label="Document content" value={content} onChange={(event) => { setContent(event.target.value); setError(""); }} placeholder="Start writing…" className="min-h-[55vh] w-full resize-y rounded bg-transparent px-1 py-2 text-base leading-8 text-[#37352f] outline-none placeholder:text-[#b4b3af] hover:bg-black/[0.02] focus:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35" /></RecordContentSection>
    <Comments workspaceId={workspaceId} entityType="document" entityId={documentId} />
  </RecordDetailShell>;
}
