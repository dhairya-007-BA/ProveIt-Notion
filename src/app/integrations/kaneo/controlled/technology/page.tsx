import { notFound } from "next/navigation";

import { KaneoControlledBusinessSyncTest } from "@/components/kaneo-controlled-business-sync-test";

export default function ControlledTechnologyKaneoVerificationPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="min-h-screen bg-[var(--background)] px-5 py-12"><KaneoControlledBusinessSyncTest workspaceId="technology" /></main>;
}
