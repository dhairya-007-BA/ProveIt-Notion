import { KaneoControlledBusinessSyncTest } from "@/components/kaneo-controlled-business-sync-test";
import { notFound } from "next/navigation";

export default function ControlledKaneoVerificationPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="min-h-screen bg-[var(--background)] px-5 py-12"><KaneoControlledBusinessSyncTest /></main>;
}
