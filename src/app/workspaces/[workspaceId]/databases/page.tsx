"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import Sidebar from "@/components/sidebar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

interface WorkspaceDatabase {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function DatabasesPage() {
  const params = useParams<{
    workspaceId: string;
  }>();

  const router = useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
  } = useAuth();

  const workspaceId = params.workspaceId;

  const [databases, setDatabases] =
    useState<WorkspaceDatabase[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [databasePendingDeletion, setDatabasePendingDeletion] =
    useState<WorkspaceDatabase | null>(null);

  const [error, setError] =
    useState("");

  /*
   * Redirect unauthenticated users.
   */
  useEffect(() => {
    if (
      !authLoading &&
      !firebaseUser
    ) {
      router.replace("/login");
    }
  }, [
    authLoading,
    firebaseUser,
    router,
  ]);

  /*
   * Load databases belonging to
   * this workspace.
   */
  useEffect(() => {
    if (
      authLoading ||
      !firebaseUser ||
      !profile ||
      !workspaceId
    ) {
      return;
    }

    async function loadDatabases() {
      try {
        setLoading(true);
        setError("");

        const databasesQuery =
          query(
            collection(
              db,
              "databases"
            ),
            where(
              "workspaceId",
              "==",
              workspaceId
            ),
            orderBy(
              "updatedAt",
              "desc"
            )
          );

        const snapshot =
          await getDocs(
            databasesQuery
          );

        const results =
          snapshot.docs.map(
            (databaseSnapshot) => {
              const data =
                databaseSnapshot.data();

              return {
                id:
                  databaseSnapshot.id,

                name:
                  data.name ||
                  "Untitled database",

                description:
                  data.description ||
                  "",

                workspaceId:
                  data.workspaceId,

                createdBy:
                  data.createdBy,

                createdAt:
                  data.createdAt
                    ?.toDate(),

                updatedAt:
                  data.updatedAt
                    ?.toDate(),
              };
            }
          );

        setDatabases(
          results
        );
      } catch (error) {
        console.error(
          "Failed to load databases:",
          error
        );

        setError(
          "Databases could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDatabases();
  }, [
    authLoading,
    firebaseUser,
    profile,
    workspaceId,
  ]);

  /*
   * Create a database.
   *
   * Properties are intentionally
   * stored as data. This will allow
   * employees to create their own
   * fields later.
   */
  async function createDatabase() {
    if (
      !firebaseUser ||
      !workspaceId ||
      creating
    ) {
      return;
    }

    try {
      setCreating(true);
      setError("");

      const databaseRef =
        await addDoc(
          collection(
            db,
            "databases"
          ),
          {
            name:
              "Untitled database",

            description:
              "",

            workspaceId,

            createdBy:
              firebaseUser.uid,

            /*
             * Every database begins
             * with a title property.
             *
             * Later the UI will allow
             * employees to add text,
             * number, select, date,
             * person, relation, etc.
             */
            properties: [
              {
                id: "title",
                name: "Name",
                type: "title",
              },
            ],

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          }
        );

      router.push(
        `/workspaces/${workspaceId}/databases/${databaseRef.id}`
      );
    } catch (error) {
      console.error(
        "Failed to create database:",
        error
      );

      setError(
        "Database could not be created."
      );

      setCreating(false);
    }
  }

  /*
   * Delete database.
   */
  async function removeDatabase(
    databaseId: string,
  ) {
    try {
      setDeletingId(
        databaseId
      );

      setError("");

      await deleteDoc(
        doc(
          db,
          "databases",
          databaseId
        )
      );

      setDatabases(
        (currentDatabases) =>
          currentDatabases.filter(
            (database) =>
              database.id !==
              databaseId
          )
      );
    } catch (error) {
      console.error(
        "Failed to delete database:",
        error
      );

      setError(
        "Database could not be deleted."
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">
          Loading databases...
        </p>
      </main>
    );
  }

  if (
    !firebaseUser ||
    !profile
  ) {
    return null;
  }

  return (
    <main className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />

      <section className="proveit-content">
        <div className="proveit-content-inner max-w-5xl">

          {/* BREADCRUMB */}

          <div>
            <Link
              href={`/workspaces/${workspaceId}`}
              className="proveit-back-link px-1"
            >
              ← Back to workspace
            </Link>
          </div>

          {/* HEADER */}

          <div className="proveit-page-header mb-8">

            <div>
              <p className="proveit-label mb-2">DATABASES</p>
              <h1 className="proveit-page-title">
                Databases
              </h1>

              <p className="mt-2 text-sm text-[var(--muted)]">
                Create databases to organize structured information.
              </p>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={
                createDatabase
              }
              className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating
                ? "Creating..."
                : "+ New database"}
            </button>

          </div>

          {/* ERROR */}

          {error && (
            <div role="alert" className="mb-6 rounded-xl border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* DATABASE LIST */}

          <div className="proveit-list">

            {databases.length ===
            0 ? (

              <div className="px-6 py-20 text-center">

                <div className="mx-auto grid h-10 w-10 place-items-center text-[var(--brand-primary)]"><DatabaseIcon /></div>

                <h2 className="mt-4 font-semibold text-[var(--foreground)]">
                  No databases yet
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                  Create a database to track projects,
                  candidates, investors, tasks, expenses,
                  or any other structured information.
                </p>

                <button
                  type="button"
                  disabled={creating}
                  onClick={
                    createDatabase
                  }
                  className="proveit-secondary-button mt-6 disabled:opacity-50"
                >
                  Create database
                </button>

              </div>

            ) : (

              databases.map(
                (database) => (

                  <div
                    key={
                      database.id
                    }
                    className="proveit-list-row group flex flex-col border-b border-[var(--border)] last:border-b-0 sm:flex-row sm:items-center"
                  >

                    <Link
                      href={`/workspaces/${workspaceId}/databases/${database.id}`}
                      className="flex w-full min-w-0 flex-1 items-center gap-3 px-4 py-3.5"
                    >

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--info-soft)] text-[var(--info)]">
                        <DatabaseIcon />
                      </div>

                      <div className="min-w-0">

                        <p className="truncate text-sm font-medium text-[var(--foreground)]">
                          {
                            database.name
                          }
                        </p>

                        <p className="mt-0.5 text-xs text-[var(--subtle)]">
                          {database.updatedAt
                            ? `Updated ${database.updatedAt.toLocaleDateString()}`
                            : "No update date"}
                        </p>

                      </div>

                    </Link>

                    <div className="flex w-full items-center justify-end gap-3 border-t border-[var(--border)] px-4 py-2 sm:w-auto sm:border-0 sm:py-0">

                      <button
                        type="button"
                        disabled={
                          deletingId ===
                          database.id
                        }
                        onClick={() => setDatabasePendingDeletion(database)}
                        aria-label={`Delete ${database.name}`}
                        title="Delete database"
                        className="grid h-10 w-10 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50"
                      >
                        {deletingId ===
                        database.id
                          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"><span className="sr-only">Deleting</span></span>
                          : <TrashIcon />}
                      </button>

                      <Link
                        href={`/workspaces/${workspaceId}/databases/${database.id}`}
                        aria-label={`Open ${database.name}`}
                        className="grid min-h-10 min-w-10 place-items-center rounded-md text-sm text-[var(--subtle)] hover:bg-[var(--hover)] hover:text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                      >
                        <ArrowIcon />
                      </Link>

                    </div>

                  </div>

                )
              )

            )}

          </div>

        </div>
      </section>
      <ConfirmDialog open={Boolean(databasePendingDeletion)} title="Delete database?" description={databasePendingDeletion ? `“${databasePendingDeletion.name}” will be permanently deleted. This cannot be undone.` : ""} confirmLabel="Delete database" loading={Boolean(deletingId)} onCancel={() => setDatabasePendingDeletion(null)} onConfirm={() => { if (databasePendingDeletion) void removeDatabase(databasePendingDeletion.id); }} />
    </main>
  );
}

function DatabaseIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]"><ellipse cx="12" cy="6" rx="6.5" ry="2.8" /><path d="M5.5 6v6c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V6M5.5 12v6c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-6" /></svg>; }
function TrashIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]"><path d="M5 7h14M9 7V4.5h6V7m2 0-.7 13h-8.6L7 7m3.5 4v5.5m3-5.5v5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ArrowIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2"><path d="M5 12h13m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
