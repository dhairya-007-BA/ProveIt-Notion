"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";

import { Workspace } from "@/types/workspace";

export default function Sidebar() {
  const { profile } = useAuth();

  const [workspaces, setWorkspaces] =
    useState<Workspace[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    if (!profile) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    async function loadWorkspaces() {
      try {
        setLoading(true);

        const data =
          await getAccessibleWorkspaces(
            profile!
          );

        setWorkspaces(data);
      } catch (error) {
        console.error(
          "Failed to load accessible workspaces:",
          error
        );

        setWorkspaces([]);
      } finally {
        setLoading(false);
      }
    }

    loadWorkspaces();
  }, [profile]);

  return (
    <aside className="min-h-screen w-72 border-r border-gray-200 bg-white p-5">
      <div className="mb-8">
        <Link href="/">
          <h1 className="text-lg font-semibold">
            ProveIt
          </h1>

          <p className="mt-1 text-xs text-gray-400">
            Internal Workspace
          </p>
        </Link>
      </div>

      <nav>
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Workspaces
        </p>

        {loading ? (
          <div className="px-2 py-3 text-sm text-gray-400">
            Loading...
          </div>
        ) : workspaces.length === 0 ? (
          <div className="px-2 py-3 text-sm text-gray-400">
            No workspaces available.
          </div>
        ) : (
          <div className="space-y-1">
            {workspaces.map(
              (workspace) => (
                <Link
                  key={workspace.id}
                  href={`/workspaces/${workspace.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <span className="text-lg">
                    {workspace.icon || "📁"}
                  </span>

                  <span className="truncate font-medium">
                    {workspace.name}
                  </span>
                </Link>
              )
            )}
          </div>
        )}
      </nav>

      {profile?.group === "bod" && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Administration
          </p>

          <nav className="space-y-1">
            <Link
              href="/admin/employees"
              className="block rounded-lg px-2 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              👥 Employees
            </Link>

            <Link
              href="/admin/workspaces"
              className="block rounded-lg px-2 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              ⚙️ Workspaces
            </Link>
          </nav>
        </div>
      )}

      {profile && (
        <div className="mt-8 border-t border-gray-100 pt-5">
          <div className="px-2">
            <p className="truncate text-sm font-medium">
              {profile.name}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {profile.employeeId}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}