import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/collections";

const INITIAL_WORKSPACES = [
  {
    id: "company",
    name: "Company",
    slug: "company",
    kind: "company",
    icon: "🏢",
    description: "Company-wide resources and information.",
  },
  {
    id: "business",
    name: "Business",
    slug: "business",
    kind: "team",
    icon: "💼",
    description: "Business operations, customers, marketing, and finance.",
  },
  {
    id: "technology",
    name: "Technology",
    slug: "technology",
    kind: "team",
    icon: "💻",
    description: "Engineering, product, research, and technical operations.",
  },
  {
    id: "board",
    name: "Board",
    slug: "board",
    kind: "board",
    icon: "🔒",
    description: "Private Board of Directors workspace.",
  },
] as const;

export async function seedInitialWorkspaces(
  createdBy: string
) {
  for (const workspace of INITIAL_WORKSPACES) {
    const workspaceRef = doc(
      db,
      COLLECTIONS.WORKSPACES,
      workspace.id
    );

    const existing = await getDoc(workspaceRef);

    if (existing.exists()) {
      continue;
    }

    await setDoc(workspaceRef, {
      name: workspace.name,
      slug: workspace.slug,
      kind: workspace.kind,
      icon: workspace.icon,
      description: workspace.description,

      active: true,

      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}