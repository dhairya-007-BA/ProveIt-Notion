import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getMembershipsForUser } from "@/lib/memberships";

import { Workspace } from "@/types/workspace";
import { ProveItUser } from "@/types/user";

async function getWorkspaceById(
  workspaceId: string
): Promise<Workspace | null> {
  const workspaceRef = doc(
    db,
    "workspaces",
    workspaceId
  );

  const snapshot = await getDoc(workspaceRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    id: snapshot.id,
    name: data.name,
    slug: data.slug,
    kind: data.kind,
    icon: data.icon,
    description: data.description,
    active: data.active,
    deletedAt: data.deletedAt?.toDate(),
    deletedBy: data.deletedBy,
    createdBy: data.createdBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

export async function getAccessibleWorkspaces(
  profile: ProveItUser
): Promise<Workspace[]> {
  let workspaceIds: string[] = [];

  if (profile.group === "bod") {
    workspaceIds = [
      "company",
      "business",
      "technology",
      "board",
    ];
  } else {
    const memberships =
      await getMembershipsForUser(profile.uid);

    workspaceIds = [
      "company",
      ...memberships.map(
        (membership) =>
          membership.workspaceId
      ),
    ];
  }

  const uniqueWorkspaceIds = [
    ...new Set(workspaceIds),
  ];

  const workspaces = await Promise.all(
    uniqueWorkspaceIds.map(
      getWorkspaceById
    )
  );

  return workspaces
    .filter(
      (
        workspace
      ): workspace is Workspace =>
        workspace !== null &&
        workspace.active &&
        !workspace.deletedAt
    )
    .sort((a, b) => {
      const preferredOrder = [
        "company",
        "business",
        "technology",
        "board",
      ];

      const aIndex =
        preferredOrder.indexOf(a.id);

      const bIndex =
        preferredOrder.indexOf(b.id);

      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;

        return aIndex - bIndex;
      }

      return a.name.localeCompare(b.name);
    });
}
