"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import WorkspaceManager from "@/components/workspaces/workspace-manager";

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
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
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
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl border bg-white p-8 text-center">
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Workspace administration is restricted to BOD members.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <WorkspaceManager />
    </main>
  );
}