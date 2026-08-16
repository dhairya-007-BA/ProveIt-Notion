"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";

const rows = [["Authentication", "authentication"], ["BOD authorization", "bodAuthorization"], ["Business create", "businessCreate"], ["Kaneo create", "kaneoCreate"], ["Durable mapping", "durableMapping"], ["Kaneo task confirmed", "kaneoTaskConfirmed"], ["Title sync", "titleSync"], ["Description sync", "descriptionSync"], ["Priority sync", "prioritySync"], ["In-progress sync", "inProgressSync"], ["Done sync", "doneSync"], ["Blocked remains ProveIt-only", "blockedSafety"], ["Comments isolated", "commentsIsolation"], ["Custom fields isolated", "customFieldsIsolation"], ["Kaneo delete", "kaneoDelete"], ["ProveIt delete", "proveItDelete"], ["Duplicates", "duplicates"], ["Automatic retries observed", "automaticRetriesObserved"]] as const;

export function KaneoControlledBusinessSyncTest() {
  const pathname = usePathname(); const { firebaseUser, profile } = useAuth();
  const [confirmed, setConfirmed] = useState(false); const [running, setRunning] = useState(false); const [attempted, setAttempted] = useState(false); const [result, setResult] = useState<Record<string, unknown> | null>(null); const lock = useRef(false);
  if (pathname !== "/integrations/kaneo" || process.env.NODE_ENV !== "development" || profile?.group !== "bod") return null;
  async function run() {
    if (!firebaseUser || !confirmed || attempted || running || lock.current) return;
    lock.current = true; setAttempted(true); setRunning(true); setResult(null);
    try { const response = await authenticatedRequest(firebaseUser, "/api/integrations/kaneo/controlled-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "RUN_CONTROLLED_BUSINESS_SYNC_TEST" }) }); const body = await response.json().catch(() => null); const payload = typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {}; const next = typeof payload.result === "object" && payload.result !== null && !Array.isArray(payload.result) ? payload.result as Record<string, unknown> : { stage: typeof payload.stage === "string" ? payload.stage : "request_received", mutationAttempted: payload.mutationAttempted === true, message: typeof payload.message === "string" ? payload.message : "Controlled verification could not be completed." }; setResult(next); if (next.mutationAttempted !== true) { lock.current = false; setAttempted(false); } }
    catch { setResult({ stage: "request_received", mutationAttempted: false, message: "Controlled verification could not be completed. It was not retried." }); lock.current = false; setAttempted(false); }
    finally { setRunning(false); }
  }
  return <section className="fixed bottom-5 right-5 z-[80] w-[min(32rem,calc(100vw-2.5rem))] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-md)]"><p className="proveit-label">Development-only · BOD-only</p><h2 className="proveit-heading mt-1 text-lg font-semibold">Controlled Business Sync Test</h2><p className="mt-2 text-sm text-[var(--danger)]">This creates and deletes one temporary Business task in ProveIt and Kaneo.</p><label className="mt-3 flex gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={confirmed} disabled={attempted} onChange={(event) => setConfirmed(event.target.checked)} />I understand this runs one real lifecycle.</label><button type="button" onClick={() => void run()} disabled={!confirmed || attempted || running} className="proveit-primary-button mt-4 disabled:cursor-not-allowed disabled:opacity-60">{running ? "Running controlled test…" : attempted ? "Controlled Test Attempt Used" : "Run controlled test"}</button>{result && <dl aria-live="polite" className="mt-4 grid max-h-64 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto text-xs">{rows.map(([label, key]) => <div key={key}><dt className="text-[var(--subtle)]">{label}</dt><dd className="font-medium">{typeof result[key] === "string" || typeof result[key] === "number" ? String(result[key]) : "Not completed"}</dd></div>)}<div className="col-span-2"><dt className="text-[var(--subtle)]">Result</dt><dd>{typeof result.message === "string" ? result.message : "Controlled verification stopped."}</dd></div></dl>}</section>;
}
