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
    <main className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <section className="flex-1 p-10">
        <div className="mx-auto max-w-6xl">

          {/* BREADCRUMB */}

          <div className="mb-8">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to workspace
            </Link>
          </div>

          {/* HEADER */}

          <div className="mb-8 flex items-start justify-between">

            <div>
              <p className="mb-2 text-sm font-medium text-gray-400">
                Workspace
              </p>

              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                Databases
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                Create databases to organize structured information.
              </p>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={
                createDatabase
              }
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">

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
                    className="flex items-center border-b border-gray-100 last:border-b-0"
                  >

                    <Link
                      href={`/workspaces/${workspaceId}/databases/${database.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4 px-6 py-5 transition hover:bg-gray-50"
                    >

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg">
                        ▦
                      </div>

                      <div className="min-w-0">

                        <p className="truncate font-medium text-gray-900">
                          {
                            database.name
                          }
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {database.updatedAt
                            ? `Updated ${database.updatedAt.toLocaleDateString()}`
                            : "No update date"}
                        </p>

                      </div>

                    </Link>

                    <div className="flex items-center gap-4 px-6">

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
