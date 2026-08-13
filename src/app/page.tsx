"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { auth } from "@/lib/firebase";

export default function Home() {
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace("/login");
    }
  }, [firebaseUser, loading, router]);

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">
          Loading ProveIt workspace...
        </p>
      </main>
    );
  }

  if (!firebaseUser) {
    return null;
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl border bg-white p-8">
          <h1 className="text-xl font-semibold">
            Profile not found
          </h1>

          <p className="mt-2 text-gray-600">
            Your authentication account exists, but no employee profile
            was found.
          </p>
        </div>
      </main>
    );
  }

  if (!profile.active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl border bg-white p-8">
          <h1 className="text-xl font-semibold">
            Account disabled
          </h1>

          <p className="mt-2 text-gray-600">
            Contact a ProveIt administrator.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <section className="flex-1 p-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome, {profile.name}
            </h1>

            <p className="mt-2 text-gray-600">
              Employee ID: {profile.employeeId}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Access group: {profile.group}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-100"
          >
            Sign Out
          </button>
        </div>
      </section>
    </main>
  );
}