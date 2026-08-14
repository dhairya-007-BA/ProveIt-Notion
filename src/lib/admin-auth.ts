import "server-only";

import {
  adminAuth,
  adminDb,
  firebaseAdminProjectId,
} from "@/lib/firebase-admin";
import {
  authorizeBOD,
} from "@/lib/admin-auth-core";
import type { AdminAuthDependencies } from "@/lib/admin-auth-core";

export { AdminAuthError } from "@/lib/admin-auth-core";

const dependencies: AdminAuthDependencies = {
  expectedProjectId: firebaseAdminProjectId,
  verifyIdToken: (idToken, checkRevoked) =>
    adminAuth.verifyIdToken(idToken, checkRevoked),
  getUserProfile: async (uid) => {
    const snapshot = await adminDb
      .collection("users")
      .doc(uid)
      .get();

    return snapshot.exists
      ? snapshot.data()
      : undefined;
  },
};

export async function requireBOD(
  request: Request,
  operation = "admin-operation"
) {
  return authorizeBOD(
    request,
    operation,
    dependencies
  );
}
