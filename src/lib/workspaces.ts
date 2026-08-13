import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/collections";
import { Workspace, WorkspaceKind } from "@/types/workspace";

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  kind: WorkspaceKind;
  icon?: string;
  description?: string;
  createdBy: string;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const workspaceQuery = query(
    collection(db, COLLECTIONS.WORKSPACES),
    orderBy("name", "asc")
  );

  const snapshot = await getDocs(workspaceQuery);

  return snapshot.docs.map((workspaceDoc) => {
    const data = workspaceDoc.data();

return {
  id: workspaceDoc.id,
  name: data.name,
  slug: data.slug,
  kind: data.kind,
  icon: data.icon,
  description: data.description,
  active: data.active,
  createdBy: data.createdBy,
  createdAt: data.createdAt?.toDate(),
  updatedAt: data.updatedAt?.toDate(),
} as Workspace;
  });
}

export async function createWorkspace(
  input: CreateWorkspaceInput
) {
  return addDoc(
    collection(db, COLLECTIONS.WORKSPACES),
    {
      ...input,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function archiveWorkspace(
  workspaceId: string
) {
  const workspaceRef = doc(
    db,
    COLLECTIONS.WORKSPACES,
    workspaceId
  );

  await updateDoc(workspaceRef, {
    active: false,
    updatedAt: serverTimestamp(),
  });
}

export async function restoreWorkspace(
  workspaceId: string
) {
  const workspaceRef = doc(
    db,
    COLLECTIONS.WORKSPACES,
    workspaceId
  );

  await updateDoc(workspaceRef, {
    active: true,
    updatedAt: serverTimestamp(),
  });
}