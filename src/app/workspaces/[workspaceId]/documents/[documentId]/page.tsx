"use client";

import Link from "next/link";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

export default function DocumentEditorPage() {
  const params =
    useParams<{
      workspaceId: string;
      documentId: string;
    }>();

  const router = useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
  } = useAuth();

  const workspaceId =
    params.workspaceId;

  const documentId =
    params.documentId;

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    content,
    setContent,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    saveStatus,
    setSaveStatus,
  ] = useState<
    "saved" | "saving" | "unsaved"
  >("saved");

  /*
   * Prevent autosave from firing
   * immediately when the document
   * first loads.
   */
  const initialLoadComplete =
    useRef(false);

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
   * Load document.
   */
  useEffect(() => {
    if (
      authLoading ||
      !firebaseUser ||
      !profile ||
      !workspaceId ||
      !documentId
    ) {
      return;
    }

    async function loadDocument() {
      try {
        setLoading(true);
        setError("");

        const documentRef =
          doc(
            db,
            "documents",
            documentId
          );

        const snapshot =
          await getDoc(
            documentRef
          );

        if (!snapshot.exists()) {
          setError(
            "Document could not be found."
          );

          return;
        }

        const data =
          snapshot.data();

        /*
         * Protect against someone
         * manually changing the URL
         * to another workspace.
         */
        if (
          data.workspaceId !==
          workspaceId
        ) {
          setError(
            "This document does not belong to this workspace."
          );

          return;
        }

        setTitle(
          data.title ||
          "Untitled"
        );

        setContent(
          data.content ||
          ""
        );

        initialLoadComplete.current =
          true;

        setSaveStatus(
          "saved"
        );
      } catch (error) {
        console.error(
          "Failed to load document:",
          error
        );

        setError(
          "Document could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDocument();
  }, [
    authLoading,
    firebaseUser,
    profile,
    workspaceId,
    documentId,
  ]);

  /*
   * Autosave.
   *
   * After the employee stops typing
   * for 700ms, save the latest title
   * and content to Firestore.
   */
  useEffect(() => {
    if (
      !initialLoadComplete.current ||
      !firebaseUser ||
      !documentId
    ) {
      return;
    }

    setSaveStatus(
      "unsaved"
    );

    const timeout =
      window.setTimeout(
        async () => {
          try {
            setSaveStatus(
              "saving"
            );

            const documentRef =
              doc(
                db,
                "documents",
                documentId
              );

            await updateDoc(
              documentRef,
              {
                title:
                  title.trim() ||
                  "Untitled",

                content,

                updatedAt:
                  serverTimestamp(),
              }
            );

            setSaveStatus(
              "saved"
            );
          } catch (error) {
            console.error(
              "Failed to save document:",
              error
            );

            setSaveStatus(
              "unsaved"
            );

            setError(
              "Your latest changes could not be saved."
            );
          }
        },
        700
      );

    return () => {
      window.clearTimeout(
        timeout
      );
    };
  }, [
    title,
    content,
    firebaseUser,
    documentId,
  ]);

  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Loading document...
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

      <section className="flex-1">
        <div className="mx-auto max-w-5xl px-10 py-8">

          {/* TOP BAR */}

          <div className="mb-8 flex items-center justify-between">

            <Link
              href={`/workspaces/${workspaceId}/documents`}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Documents
            </Link>

            <div className="text-xs text-gray-400">
              {saveStatus ===
                "saving" &&
                "Saving..."}

              {saveStatus ===
                "saved" &&
                "Saved"}

              {saveStatus ===
                "unsaved" &&
                "Unsaved changes"}
            </div>
          </div>

          {/* ERROR */}

          {error && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* EDITOR */}

          <div className="min-h-[75vh] rounded-xl border border-gray-200 bg-white shadow-sm">

            <div className="border-b border-gray-100 px-12 pb-6 pt-10">

              <input
                type="text"
                value={title}
                onChange={(event) => {
                  setTitle(
                    event.target.value
                  );

                  setError("");
                }}
                placeholder="Untitled"
                className="w-full border-none bg-transparent text-4xl font-semibold tracking-tight text-gray-900 outline-none placeholder:text-gray-300"
              />

            </div>

            <div className="px-12 py-8">

              <textarea
                value={content}
                onChange={(event) => {
                  setContent(
                    event.target.value
                  );

                  setError("");
                }}
                placeholder="Start writing..."
                className="min-h-[55vh] w-full resize-none border-none bg-transparent text-base leading-8 text-gray-800 outline-none placeholder:text-gray-300"
              />

            </div>

          </div>

        </div>
      </section>
    </main>
  );
}