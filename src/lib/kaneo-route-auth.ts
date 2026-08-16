import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isAdminCredentialFailure } from "@/lib/admin-auth-core";

export class KaneoRouteAuthError extends Error {
  status: 401 | 403 | 404 | 503;

  constructor(message: string, status: 401 | 403 | 404 | 503) {
    super(message);
    this.name = "KaneoRouteAuthError";
    this.status = status;
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new KaneoRouteAuthError("Authentication required.", 401);
  }

  const token = authorization.slice(7).trim();
  if (!token) throw new KaneoRouteAuthError("Authentication required.", 401);
  return token;
}

export async function requireKaneoUser(request: Request) {
  let decoded: { uid: string };

  try {
    decoded = await adminAuth.verifyIdToken(bearerToken(request), true);
  } catch (error) {
    if (error instanceof KaneoRouteAuthError) throw error;
    if (isAdminCredentialFailure(error)) {
      throw new KaneoRouteAuthError(
        "Server authentication is temporarily unavailable.",
        503
      );
    }
    throw new KaneoRouteAuthError("Invalid or expired authentication.", 401);
  }

  const profile = await adminDb.collection("users").doc(decoded.uid).get();
  if (!profile.exists || profile.data()?.active !== true) {
    throw new KaneoRouteAuthError("Active employee account required.", 403);
  }

  return { uid: decoded.uid, profile: profile.data() ?? {} };
}

export async function requireKaneoWorkspaceAccess(
  request: Request,
  workspaceId: string
) {
  const user = await requireKaneoUser(request);
  const workspace = await adminDb.collection("workspaces").doc(workspaceId).get();

  if (!workspace.exists || workspace.data()?.active !== true || workspace.data()?.deletedAt) {
    throw new KaneoRouteAuthError("Workspace not found.", 404);
  }

  const membership = await adminDb
    .collection("workspaceMemberships")
    .doc(`${workspaceId}_${user.uid}`)
    .get();

  if (membership.exists && membership.data()?.active === true) return user;

  const capabilities = user.profile.capabilities;
  const hasNoExplicitCapabilities = typeof capabilities !== "object" ||
    capabilities === null || Object.keys(capabilities).length === 0;
  if (
    (user.profile.role === "bod" || user.profile.group === "bod") &&
    hasNoExplicitCapabilities
  ) return user;

  throw new KaneoRouteAuthError("Workspace access required.", 403);
}

/** Mirrors the existing Firestore task-delete policy for server routes. */
export async function requireKaneoBusinessDeleteAccess(request: Request) {
  const user = await requireKaneoWorkspaceAccess(request, "business");
  if (user.profile.role === "bod" || user.profile.group === "bod") return user;
  throw new KaneoRouteAuthError("Business task deletion requires BOD access.", 403);
}
