"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";

import {
  archiveWorkspace,
  createWorkspace,
  getWorkspaces,
  restoreWorkspace,
} from "@/lib/workspaces";

import { seedInitialWorkspaces } from "@/lib/seed-workspaces";

import { Workspace } from "@/types/workspace";

const DEFAULT_ICON = "📁";

export default function WorkspaceManager() {
  const { profile } = useAuth();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);

  const isBOD = profile?.group === "bod";

  async function loadWorkspaces() {
    try {
      setLoading(true);

      const data = await getWorkspaces();

      setWorkspaces(data);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspaces();
  }, []);

  async function handleCreateWorkspace() {
    if (!profile || !isBOD) {
      return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      await createWorkspace({
        name: trimmedName,
        slug,
        kind: "custom",
        icon: icon.trim() || DEFAULT_ICON,
        createdBy: profile.uid,
      });

      setName("");
      setIcon(DEFAULT_ICON);
      setCreating(false);

      await loadWorkspaces();
    } catch (error) {
      console.error(
        "Failed to create workspace:",
        error
      );
    }
  }

  async function handleArchive(workspaceId: string) {
    if (!isBOD) {
      return;
    }

    try {
      await archiveWorkspace(workspaceId);

      await loadWorkspaces();
    } catch (error) {
      console.error(
        "Failed to archive workspace:",
        error
      );
    }
  }

  async function handleRestore(workspaceId: string) {
    if (!isBOD) {
      return;
    }

    try {
      await restoreWorkspace(workspaceId);

      await loadWorkspaces();
    } catch (error) {
      console.error(
        "Failed to restore workspace:",
        error
      );
    }
  }

  async function handleSeedWorkspaces() {
    if (!profile || !isBOD) {
      return;
    }

    try {
      await seedInitialWorkspaces(profile.uid);

      await loadWorkspaces();
    } catch (error) {
      console.error(
        "Failed to seed initial workspaces:",
        error
      );
    }
  }

  if (!isBOD) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}

      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-500">
            Administration
          </p>

          <h1 className="text-3xl font-semibold tracking-tight">
            Workspaces
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Create and manage the spaces used across ProveIt.
            Archived workspaces retain their historical data.
          </p>
        </div>

        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          + New workspace
        </button>
      </div>

      {/* Create workspace form */}

      {creating && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-medium">
            Create workspace
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Add a new workspace to ProveIt.
          </p>

          <div className="mt-4 flex gap-3">
            <input
              value={icon}
              onChange={(event) =>
                setIcon(event.target.value)
              }
              className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-center"
              maxLength={4}
              aria-label="Workspace icon"
            />

            <input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Workspace name"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-gray-400"
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setName("");
                setIcon(DEFAULT_ICON);
              }}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>

            <button
              onClick={handleCreateWorkspace}
              disabled={!name.trim()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Workspace list */}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">
            Loading workspaces...
          </div>
        ) : workspaces.length === 0 ? (
          /* Empty state */

          <div className="p-10 text-center">
            <div className="text-3xl">
              🏢
            </div>

            <h2 className="mt-4 font-medium">
              No workspaces yet
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Set up the foundational ProveIt workspaces.
            </p>

            <button
              onClick={handleSeedWorkspaces}
              className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Set up ProveIt workspaces
            </button>
          </div>
        ) : (
          /* Existing workspaces */

          workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="flex items-center justify-between border-b border-gray-100 px-5 py-4 last:border-b-0"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xl">
                  {workspace.icon || DEFAULT_ICON}
                </div>

                <div>
                  <div className="flex items-center gap-2">
<Link
  href={`/admin/workspaces/${workspace.id}`}
  className="font-medium hover:underline"
>
  {workspace.name}
</Link>

                    {!workspace.active && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        Archived
                      </span>
                    )}

                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs capitalize text-gray-400">
                      {workspace.kind}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-gray-400">
                    /{workspace.slug}
                  </p>

                  {workspace.description && (
                    <p className="mt-1 text-sm text-gray-500">
                      {workspace.description}
                    </p>
                  )}
                </div>
              </div>

              <div>
                {workspace.active ? (
                  <button
                    onClick={() =>
                      handleArchive(workspace.id)
                    }
                    className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleRestore(workspace.id)
                    }
                    className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Information */}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-medium">
          About workspaces
        </h3>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Workspaces organize ProveIt&apos;s teams, documents,
          tasks, meetings, databases, and historical records.
          Archiving a workspace removes it from normal navigation
          without deleting its underlying information.
        </p>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          Workspace administration is restricted to members of
          the Board of Directors.
        </p>
      </div>
    </div>
  );
}