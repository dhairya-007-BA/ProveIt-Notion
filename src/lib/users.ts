import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/collections";
import { ProveItUser } from "@/types/user";

export async function getUsers(): Promise<ProveItUser[]> {
  const snapshot = await getDocs(
    collection(db, COLLECTIONS.USERS)
  );

  return snapshot.docs.map((userDoc) => {
    const data = userDoc.data();

    return {
      uid: userDoc.id,
      employeeId: data.employeeId,
      name: data.name,
      group: data.role,
      active: data.active,
    } as ProveItUser;
  });
}