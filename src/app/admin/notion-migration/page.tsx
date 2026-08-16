"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { useAuth } from "@/components/auth-provider";
import { NotionMigrationPreview } from "@/components/admin/notion-migration-preview";

export default function NotionMigrationPage() {
  const { firebaseUser, profile, loading } = useAuth(); const router = useRouter();
  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [firebaseUser, loading, router]);
  if (loading || !firebaseUser || !profile) return null;
  const allowed = profile.group === "bod" || profile.capabilities?.manageWorkspaces === true;
  if (!allowed) return <main className="min-h-screen bg-[var(--background)] p-8"><p className="text-sm text-[var(--muted)]">Administrative workspace access is required.</p></main>;
  return <main className="min-h-screen bg-[var(--background)] px-5 py-8 md:px-8"><div className="mx-auto max-w-6xl"><BackButton href="/" label="Home" /><div className="mt-5"><NotionMigrationPreview /></div></div></main>;
}
