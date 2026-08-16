import "server-only";

import {
  adminAuth,
  adminDb,
  firebaseAdminProjectId,
} from "@/lib/firebase-admin";
import {
  authorizeCapability,
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
  return authorizeCapability(
    request,
    operation,
    dependencies,
    "manageEmployees"
  );
}

export async function requireCapability(
  request: Request,
  capability: "manageEmployees" | "manageWorkspaces" | "manageGlobalSettings",
  operation = "admin-operation"
) {
  return authorizeCapability(request, operation, dependencies, capability);
}
