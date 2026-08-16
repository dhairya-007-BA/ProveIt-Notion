import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isAdminCredentialFailure } from "@/lib/admin-auth-core";

export class CustomFieldAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 | 404 | 503,
    public code:
      | "custom_fields_authentication_failed"
      | "custom_fields_authorization_failed"
      | "custom_fields_workspace_not_found"
      | "custom_fields_access_check_failed"
      | "custom_fields_server_authentication_unavailable" =
      status === 401
        ? "custom_fields_authentication_failed"
      : status === 404
          ? "custom_fields_workspace_not_found"
        : status === 503
          ? "custom_fields_server_authentication_unavailable"
          : "custom_fields_authorization_failed"
  ) {
    super(message);
    this.name = "CustomFieldAuthError";
  }
}

function token(request: Request) {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ") || !value.slice(7).trim()) throw new CustomFieldAuthError("Authentication required.", 401);
  return value.slice(7).trim();
}

export async function requireCustomFieldWorkspaceUser(request: Request, workspaceId: string, manager = false) {
  let decoded: { uid: string };
  try { decoded = await adminAuth.verifyIdToken(token(request), true); }
  catch (error) {
    if (error instanceof CustomFieldAuthError) throw error;
    throw new CustomFieldAuthError(isAdminCredentialFailure(error) ? "Server authentication is temporarily unavailable." : "Invalid or expired authentication.", isAdminCredentialFailure(error) ? 503 : 401);
  }
  let profileSnapshot;
  let workspaceSnapshot;
  let membershipSnapshot;
  try {
    [profileSnapshot, workspaceSnapshot, membershipSnapshot] = await Promise.all([
      adminDb.collection("users").doc(decoded.uid).get(),
      adminDb.collection("workspaces").doc(workspaceId).get(),
      adminDb.collection("workspaceMemberships").doc(`${workspaceId}_${decoded.uid}`).get(),
    ]);
  } catch {
    // The caller is authenticated, but the trusted server could not complete
    // the three fixed access reads. Keep this distinct from a user denial and
    // never serialize the Admin SDK error.
    throw new CustomFieldAuthError(
      "Workspace access is temporarily unavailable.",
      503,
      "custom_fields_access_check_failed"
    );
  }
  const profile = profileSnapshot.data();
  if (!profileSnapshot.exists || profile?.active !== true) throw new CustomFieldAuthError("Active employee account required.", 403);
  if (!workspaceSnapshot.exists || workspaceSnapshot.data()?.active !== true || workspaceSnapshot.data()?.deletedAt) throw new CustomFieldAuthError("Workspace not found.", 404);
  const capabilities = profile.capabilities;
  const hasExplicit = typeof capabilities === "object" && capabilities !== null && Object.keys(capabilities).length > 0;
  const legacyBod = (profile.role === "bod" || profile.group === "bod") && !hasExplicit;
  const member = membershipSnapshot.exists && membershipSnapshot.data()?.active === true;
  const membership = membershipSnapshot.data();
  // Workspace memberships historically use `role`; a short-lived earlier
  // manager UI used `accessLevel`. Accept only the two documented manager
  // roles from either representation.
  const workspaceManager = member && (
    membership?.accessLevel === "admin" ||
    membership?.role === "manager" ||
    membership?.role === "admin"
  );
  const globalManager = typeof capabilities === "object" && capabilities !== null && (capabilities as Record<string, unknown>).manageWorkspaces === true;
  if (!(member || legacyBod || globalManager)) throw new CustomFieldAuthError("Workspace access required.", 403);
  if (manager && !(workspaceManager || legacyBod || globalManager)) throw new CustomFieldAuthError("Workspace-management capability required.", 403);
  return { uid: decoded.uid };
}
