"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import WorkspaceManager from "@/components/workspaces/workspace-manager";
import { BackButton } from "@/components/back-button";
import Sidebar from "@/components/sidebar";

export default function WorkspaceAdminPage() {
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace("/login");
    }
  }, [firebaseUser, loading, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">
          Loading...
        </p>
      </main>
    );
  }

  if (!firebaseUser || !profile) {
    return null;
  }

  if (profile.group !== "bod") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-5">
        <div className="proveit-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Workspace administration is restricted to BOD members.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content">
      <div className="mx-auto max-w-5xl"><BackButton href="/" label="Home" /><WorkspaceManager /></div>
    </section>
    </main>
  );
}
