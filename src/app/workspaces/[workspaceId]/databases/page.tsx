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
    databaseName: string
  ) {
    const confirmed =
      window.confirm(
        `Delete "${databaseName}"?`
      );

    if (!confirmed) {
      return;
    }

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
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
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

              <p className="mt-2 text-sm text-[#787774]">
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
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* DATABASE LIST */}

          <div className="proveit-list">

            {databases.length ===
            0 ? (

              <div className="px-6 py-20 text-center">

                <div className="text-4xl">
                  ▦
                </div>

                <h2 className="mt-4 font-semibold text-gray-900">
                  No databases yet
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
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
                  className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
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
                    className="proveit-list-row group flex items-center border-b border-black/[0.08] last:border-b-0"
                  >

                    <Link
                      href={`/workspaces/${workspaceId}/databases/${database.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                    >

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar)] text-base">
                        ▦
                      </div>

                      <div className="min-w-0">

                        <p className="truncate text-sm font-medium text-[#37352f]">
                          {
                            database.name
                          }
                        </p>

                        <p className="mt-0.5 text-xs text-[#9b9a97]">
                          {database.updatedAt
                            ? `Updated ${database.updatedAt.toLocaleDateString()}`
                            : "No update date"}
                        </p>

                      </div>

                    </Link>

                    <div className="flex items-center gap-3 px-4">

                      <button
                        type="button"
                        disabled={
                          deletingId ===
                          database.id
                        }
                        onClick={() =>
                          removeDatabase(
                            database.id,
                            database.name
                          )
                        }
                        className="text-xs text-gray-400 transition hover:text-red-600 disabled:opacity-50"
                      >
                        {deletingId ===
                        database.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>

                      <Link
                        href={`/workspaces/${workspaceId}/databases/${database.id}`}
                        className="text-sm text-gray-300"
                      >
                        →
                      </Link>

                    </div>

                  </div>

                )
              )

            )}

          </div>

        </div>
      </section>
    </main>
  );
}
