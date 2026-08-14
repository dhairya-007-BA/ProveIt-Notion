"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { ProveItLogo } from "@/components/proveit-logo";
import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { Workspace } from "@/types/workspace";
import { db } from "@/lib/firebase";

export default function Sidebar() {
  const { profile, firebaseUser } = useAuth();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const workspaceId = pathname.match(/^\/workspaces\/([^/]+)/)?.[1];

  useEffect(() => {
    if (!firebaseUser || !workspaceId) return;
    return onSnapshot(query(collection(db, "notifications"), where("recipientUid", "==", firebaseUser.uid)), (snapshot) => setUnread(snapshot.docs.filter((item) => item.data().workspaceId === workspaceId && !item.data().readAt && !item.data().archivedAt).length), (error) => console.error("Failed to load inbox badge:", error));
  }, [firebaseUser, workspaceId]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    async function loadWorkspaces() {
      try {
        setLoading(true);
        setWorkspaces(await getAccessibleWorkspaces(profile!));
      } catch (error) {
        console.error("Failed to load accessible workspaces:", error);
        setWorkspaces([]);
      } finally {
        setLoading(false);
      }
    }

    loadWorkspaces();
  }, [profile]);

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-black/[0.09] bg-[#f7f7f5] px-2.5 py-3 text-[#37352f] max-md:hidden">
      <Link
        href="/"
        className="mb-5 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-black/[0.05]"
      >
        <ProveItLogo className="h-7 w-7" priority />
        <span className="text-sm font-semibold tracking-[-0.01em]">ProveIt</span>
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto">
        {workspaceId && <Link href={`/workspaces/${workspaceId}/inbox`} className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/[0.055]"><span>◉</span><span>Inbox</span>{unread > 0 && <span aria-label={`${unread} unread notifications`} className="ml-auto rounded-full bg-[#e1e1de] px-1.5 py-0.5 text-[11px]">{unread}</span>}</Link>}
        <p className="mb-1 px-2 py-1 text-[11px] font-medium text-[#787774]">WORKSPACES</p>
        {loading ? (
          <p className="px-2 py-2 text-sm text-[#9b9a97]">Loading…</p>
        ) : workspaces.length === 0 ? (
          <p className="px-2 py-2 text-sm text-[#9b9a97]">No workspaces available.</p>
        ) : (
          <div className="space-y-0.5">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/workspaces/${workspace.id}`}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-black/[0.055]"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center text-base leading-none">
                  {workspace.icon || "▦"}
                </span>
                <span className="truncate">{workspace.name}</span>
                <span className="ml-auto opacity-0 transition group-hover:opacity-40">›</span>
              </Link>
            ))}
          </div>
        )}

        {profile?.group === "bod" && (
          <div className="mt-6 border-t border-black/[0.07] pt-4">
            <p className="mb-1 px-2 py-1 text-[11px] font-medium text-[#787774]">ADMINISTRATION</p>
            <Link href="/admin/employees" className="block rounded-md px-2 py-1.5 text-sm hover:bg-black/[0.055]">Employees</Link>
            <Link href="/admin/workspaces" className="block rounded-md px-2 py-1.5 text-sm hover:bg-black/[0.055]">Workspace settings</Link>
          </div>
        )}
      </nav>

      {profile && (
        <div className="mt-3 flex items-center gap-2 rounded-md border-t border-black/[0.07] px-2 pt-3">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#e7e7e4] text-xs font-semibold text-[#5f5e5a]">
            {profile.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{profile.name}</p>
            <p className="truncate text-[11px] text-[#9b9a97]">{profile.employeeId}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
