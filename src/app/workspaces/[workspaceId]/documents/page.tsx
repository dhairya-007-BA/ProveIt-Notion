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

interface WorkspaceDocument {
  id: string;
  title: string;
  workspaceId: string;
  type: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function DocumentsPage() {
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

  const [documents, setDocuments] =
    useState<WorkspaceDocument[]>([]);

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
    if (!authLoading && !firebaseUser) {
      router.replace("/login");
    }
  }, [
    authLoading,
    firebaseUser,
    router,
  ]);

  /*
   * Load documents for this workspace.
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

    async function loadDocuments() {
      try {
        setLoading(true);
        setError("");

        const documentsQuery =
          query(
            collection(
              db,
              "documents"
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
            documentsQuery
          );

        const results =
          snapshot.docs.map(
            (documentSnapshot) => {
              const data =
                documentSnapshot.data();

              return {
                id:
                  documentSnapshot.id,

                title:
                  data.title ||
                  "Untitled",

                workspaceId:
                  data.workspaceId,

                type:
                  data.type ||
                  "document",

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

        setDocuments(results);
      } catch (error) {
        console.error(
          "Failed to load documents:",
          error
        );

        setError(
          "Documents could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDocuments();
  }, [
    authLoading,
    firebaseUser,
    profile,
    workspaceId,
  ]);

  /*
   * Create a new document.
   */
  async function createDocument() {
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

      const documentRef =
        await addDoc(
          collection(
            db,
            "documents"
          ),
          {
            title:
              "Untitled",

            content:
              "",

            workspaceId,

            type:
              "document",

            createdBy:
              firebaseUser.uid,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          }
        );

      router.push(
        `/workspaces/${workspaceId}/documents/${documentRef.id}`
      );
    } catch (error) {
      console.error(
        "Failed to create document:",
        error
      );

      setError(
        "Document could not be created."
      );

      setCreating(false);
    }
  }

  /*
   * Delete a document.
   */
  async function deleteDocument(
    documentId: string,
    documentTitle: string
  ) {
    if (deletingId) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${documentTitle}"?\n\nThis cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(
        documentId
      );

      setError("");

      await deleteDoc(
        doc(
          db,
          "documents",
          documentId
        )
      );

      setDocuments(
        (currentDocuments) =>
          currentDocuments.filter(
            (document) =>
              document.id !==
              documentId
          )
      );
    } catch (error) {
      console.error(
        "Failed to delete document:",
        error
      );

      setError(
        "Document could not be deleted."
      );
    } finally {
      setDeletingId(null);
    }
  }

  /*
   * Loading state.
   */
  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Loading documents...
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
        <div className="proveit-content-inner">

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
              <p className="proveit-label mb-2">
                Documents
              </p>

              <h1 className="proveit-page-title">
                Documents
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                Create and organize documents
                for this workspace.
              </p>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={createDocument}
              className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating
                ? "Creating..."
                : "+ New document"}
            </button>

          </div>

          {/* ERROR */}

          {error && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* DOCUMENTS */}

          <div className="proveit-list">

            {documents.length === 0 ? (
              <div className="px-6 py-16 text-center">

                <div className="text-4xl">
                  📄
                </div>

                <h2 className="mt-4 font-semibold">
                  No documents yet
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                  Create your first document
                  for this workspace.
                </p>

              </div>
            ) : (
              documents.map(
                (document) => (
                  <div
                    key={document.id}
                    className="proveit-list-row flex items-center justify-between border-b border-gray-100 px-6 py-5 last:border-b-0"
                  >

                    {/* DOCUMENT LINK */}

                    <Link
                      href={`/workspaces/${workspaceId}/documents/${document.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4"
                    >

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar)]">
                        📄
                      </div>

                      <div className="min-w-0">

                        <p className="truncate font-medium text-[var(--foreground)]">
                          {document.title}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {document.updatedAt
                            ? `Updated ${document.updatedAt.toLocaleDateString()}`
                            : "No update date"}
                        </p>

                      </div>

                    </Link>

                    {/* ACTIONS */}

                    <div className="ml-6 flex items-center gap-4">

                      <button
                        type="button"
                        disabled={
                          deletingId ===
                          document.id
                        }
                        onClick={() =>
                          deleteDocument(
                            document.id,
                            document.title
                          )
                        }
                        className="rounded-md px-3 py-2 text-sm text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId ===
                        document.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>

                      <Link
                        href={`/workspaces/${workspaceId}/documents/${document.id}`}
                        className="text-sm text-gray-300 transition hover:text-gray-600"
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
