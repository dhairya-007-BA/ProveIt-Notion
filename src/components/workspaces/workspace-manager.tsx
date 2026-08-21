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
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);

  const isBOD = profile?.group === "bod";

  async function loadWorkspaces() {
    try {
      setLoading(true);
      setError("");

      const data = await getWorkspaces();

      setWorkspaces(data);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
      setError("Workspaces could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;

    void getWorkspaces()
      .then((data) => {
        if (current) {
          setWorkspaces(data);
        }
      })
      .catch((error) => {
        console.error("Failed to load workspaces:", error);
        if (current) setError("Workspaces could not be loaded. Please retry.");
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });

    return () => {
      current = false;
    };
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

      <div className="proveit-page-header mb-8">
        <div>
          <p className="proveit-label mb-2">
            Administration
          </p>

          <h1 className="proveit-page-title">
            Workspaces
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Create and manage the spaces used across ProveIt.
            Archived workspaces retain their historical data.
          </p>
        </div>

        <button
          onClick={() => setCreating(true)}
          className="proveit-primary-button"
        >
          + New workspace
        </button>
      </div>

      {/* Create workspace form */}

      {creating && (
        <div className="proveit-card mb-6 p-5">
          <h2 className="font-medium">
            Create workspace
          </h2>

          <p className="mt-1 text-sm text-[var(--muted)]">
            Add a new workspace to ProveIt.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-[4rem_1fr]">
            <input
              value={icon}
              onChange={(event) =>
                setIcon(event.target.value)
              }
              className="proveit-control w-full px-3 py-2 text-center"
              maxLength={4}
              aria-label="Workspace icon"
            />

            <input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Workspace name"
              aria-label="Workspace name"
              className="proveit-control min-w-0 px-3 py-2"
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setName("");
                setIcon(DEFAULT_ICON);
              }}
              className="proveit-secondary-button"
            >
              Cancel
            </button>

            <button
              onClick={handleCreateWorkspace}
              disabled={!name.trim()}
              className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Workspace list */}

      {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--danger)]"><span>{error}</span><button type="button" onClick={() => void loadWorkspaces()} className="proveit-secondary-button">Retry</button></div>}
      <div className="proveit-card overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-[var(--muted)]">
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

            <p className="mt-1 text-sm text-[var(--muted)]">
              Set up the foundational ProveIt workspaces.
            </p>

            <button
              onClick={handleSeedWorkspaces}
              className="proveit-primary-button mt-5"
            >
              Set up ProveIt workspaces
            </button>
          </div>
        ) : (
          /* Existing workspaces */

          workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="flex flex-col gap-4 border-b border-[var(--border)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-xl">
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

                    {workspace.deletedAt ? (
                      <span className="rounded-full bg-[var(--status-danger-bg)] px-2 py-0.5 text-xs text-[var(--danger)]">
                        Deleted permanently
                      </span>
                    ) : !workspace.active && (
                      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--muted)]">
                        Archived
                      </span>
                    )}

                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs capitalize text-[var(--subtle)]">
                      {workspace.kind}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-[var(--subtle)]">
                    /{workspace.slug}
                  </p>

                  {workspace.description && (
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {workspace.description}
                    </p>
                  )}
                </div>
              </div>

              <div>
                {workspace.deletedAt ? (
                  <span className="text-sm text-[var(--subtle)]">Tombstoned</span>
                ) : workspace.active ? (
                  <button
                    onClick={() =>
                      handleArchive(workspace.id)
                    }
                    className="proveit-secondary-button"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleRestore(workspace.id)
                    }
                    className="proveit-secondary-button"
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

      <div className="proveit-card mt-6 p-5">
        <h3 className="text-sm font-medium">
          About workspaces
        </h3>

        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Workspaces organize ProveIt&apos;s teams, documents,
          tasks, meetings, databases, and historical records.
          Archiving a workspace removes it from normal navigation
          without deleting its underlying information.
        </p>

        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Workspace administration is restricted to members of
          the Board of Directors.
        </p>
      </div>
    </div>
  );
}
