"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  doc,
  getDoc,
} from "firebase/firestore";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";

import { db } from "@/lib/firebase";
import { Workspace } from "@/types/workspace";

export default function WorkspacePage() {
  const params =
    useParams<{
      workspaceId: string;
    }>();

  const router = useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
  } = useAuth();

  const [workspace, setWorkspace] =
    useState<Workspace | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [
    accessDenied,
    setAccessDenied,
  ] = useState(false);

  const workspaceId =
    params.workspaceId;

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

  useEffect(() => {
    if (
      authLoading ||
      !firebaseUser ||
      !profile ||
      !workspaceId
    ) {
      return;
    }

    async function loadWorkspace() {
      try {
        setLoading(true);
        setAccessDenied(false);

        const workspaceRef =
          doc(
            db,
            "workspaces",
            workspaceId
          );

        const snapshot =
          await getDoc(
            workspaceRef
          );

        if (!snapshot.exists()) {
          setWorkspace(null);
          return;
        }

        const data =
          snapshot.data();

        setWorkspace({
          id: snapshot.id,
          name: data.name,
          slug: data.slug,
          kind: data.kind,
          icon: data.icon,
          description:
            data.description,
          active: data.active,
          createdBy:
            data.createdBy,
          createdAt:
            data.createdAt?.toDate(),
          updatedAt:
            data.updatedAt?.toDate(),
        });
      } catch (error: unknown) {
        console.error(
          "Failed to load workspace:",
          error
        );

        setWorkspace(null);
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    }

    loadWorkspace();
  }, [
    authLoading,
    firebaseUser,
    profile,
    workspaceId,
  ]);

  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Loading workspace...
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

  if (accessDenied) {
    return (
      <main className="flex min-h-screen bg-gray-50">
        <Sidebar />

        <section className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center">
            <div className="text-3xl">
              🔒
            </div>

            <h1 className="mt-4 text-xl font-semibold">
              Access denied
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              You do not have
              access to this
              workspace.
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (
    !workspace ||
    !workspace.active
  ) {
    return (
      <main className="flex min-h-screen bg-gray-50">
        <Sidebar />

        <section className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center">
            <h1 className="text-xl font-semibold">
              Workspace unavailable
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              This workspace does
              not exist or has been
              archived.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />

      <section className="min-w-0 flex-1 px-5 py-7 sm:px-8 md:px-10">
        <div className="mx-auto max-w-5xl">

          {/* WORKSPACE HEADER */}

          <div className="mb-9">
            <div className="flex items-center gap-4">

              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--sidebar)] text-2xl">
                {workspace.icon ||
                  "📁"}
              </div>

              <div>
                <p className="proveit-label capitalize">
                  {workspace.kind}{" "}
                  workspace
                </p>

                <h1 className="proveit-page-title mt-1">
                  {workspace.name}
                </h1>
              </div>
            </div>

            {workspace.description && (
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                {
                  workspace.description
                }
              </p>
            )}
          </div>

          {/* WORKSPACE MODULES */}

          <div className="max-w-4xl border-t border-[var(--border)] pt-3 sm:grid sm:grid-cols-2 sm:gap-x-5">

            <WorkspaceCard
              href={`/workspaces/${workspaceId}/dashboard`}
              icon="◫"
              title="Dashboard"
              description="Live overview of tasks, priorities, meetings, and activity."
            />

            <WorkspaceCard
              href={`/workspaces/${workspaceId}/documents`}
              icon="📄"
              title="Documents"
              description="Policies, plans, reference material and historical documents."
            />

            <WorkspaceCard
              href={`/workspaces/${workspaceId}/tasks`}
              icon="✅"
              title="Tasks"
              description="Track work, ownership, status, priorities and deadlines."
            />

            <WorkspaceCard
              href={`/workspaces/${workspaceId}/meetings`}
              icon="📅"
              title="Meetings"
              description="Meeting notes, decisions, transcripts and action items."
            />

            <WorkspaceCard
              href={`/workspaces/${workspaceId}/databases`}
              icon="🗂️"
              title="Databases"
              description="Structured operational information for this workspace."
            />

            <WorkspaceCard
              href={`/workspaces/${workspaceId}/activity`}
              icon="🕘"
              title="Recent activity"
              description="See recent changes and activity across this workspace."
            />

          </div>
        </div>
      </section>
    </main>
  );
}

function WorkspaceCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-md px-3 py-3 transition hover:bg-[var(--hover)]"
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--sidebar)] text-lg">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">{title}</h2>
          <span className="text-[var(--subtle)] transition group-hover:translate-x-0.5">›</span>
        </div>
        <p className="mt-0.5 text-sm leading-5 text-[var(--muted)]">{description}</p>
      </div>
    </Link>
  );
}
