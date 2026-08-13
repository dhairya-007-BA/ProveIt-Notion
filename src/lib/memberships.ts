import {
  collection,
  setDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/collections";

import {
  MembershipRole,
  WorkspaceMembership,
} from "@/types/membership";

export interface CreateMembershipInput {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
  createdBy: string;
}

export async function getMembershipsForUser(
  userId: string
): Promise<WorkspaceMembership[]> {
  const membershipQuery = query(
    collection(
      db,
      COLLECTIONS.WORKSPACE_MEMBERSHIPS
    ),
    where("userId", "==", userId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(membershipQuery);

  return snapshot.docs.map((membershipDoc) => {
    const data = membershipDoc.data();

    return {
      id: membershipDoc.id,
      workspaceId: data.workspaceId,
      userId: data.userId,
      role: data.role,
      active: data.active,
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as WorkspaceMembership;
  });
}

export async function getMembershipsForWorkspace(
  workspaceId: string
): Promise<WorkspaceMembership[]> {
  const membershipQuery = query(
    collection(
      db,
      COLLECTIONS.WORKSPACE_MEMBERSHIPS
    ),
    where("workspaceId", "==", workspaceId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(membershipQuery);

  return snapshot.docs.map((membershipDoc) => {
    const data = membershipDoc.data();

    return {
      id: membershipDoc.id,
      workspaceId: data.workspaceId,
      userId: data.userId,
      role: data.role,
      active: data.active,
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as WorkspaceMembership;
  });
}

export async function createMembership(
  input: CreateMembershipInput
) {
  const membershipId =
    `${input.workspaceId}_${input.userId}`;

  const membershipRef = doc(
    db,
    COLLECTIONS.WORKSPACE_MEMBERSHIPS,
    membershipId
  );

  await setDoc(
    membershipRef,
    {
      ...input,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    }
  );

  return membershipRef;
}

export async function updateMembershipRole(
  membershipId: string,
  role: MembershipRole
) {
  const membershipRef = doc(
    db,
    COLLECTIONS.WORKSPACE_MEMBERSHIPS,
    membershipId
  );

  await updateDoc(membershipRef, {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function removeMembership(
  membershipId: string
) {
  const membershipRef = doc(
    db,
    COLLECTIONS.WORKSPACE_MEMBERSHIPS,
    membershipId
  );

  await updateDoc(membershipRef, {
    active: false,
    updatedAt: serverTimestamp(),
  });
}

export async function restoreMembership(
  membershipId: string
) {
  const membershipRef = doc(
    db,
    COLLECTIONS.WORKSPACE_MEMBERSHIPS,
    membershipId
  );

  await updateDoc(membershipRef, {
    active: true,
    updatedAt: serverTimestamp(),
  });
}