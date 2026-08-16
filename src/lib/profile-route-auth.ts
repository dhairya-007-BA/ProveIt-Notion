import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { AdminAuthError, isAdminCredentialFailure } from "@/lib/admin-auth-core";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new AdminAuthError("Authentication required.", 401);
  const token = authorization.slice(7).trim();
  if (!token) throw new AdminAuthError("Authentication required.", 401);
  return token;
}

export async function requireAuthenticatedProfile(request: Request) {
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(bearerToken(request), true)).uid;
  } catch (error) {
    if (error instanceof AdminAuthError) throw error;
    if (isAdminCredentialFailure(error)) throw new AdminAuthError("Server authentication is temporarily unavailable.", 503);
    throw new AdminAuthError("Invalid or expired authentication.", 401);
  }

  const snapshot = await adminDb.collection("users").doc(uid).get();
  if (!snapshot.exists) throw new AdminAuthError("Employee profile not found.", 403);
  const profile = snapshot.data() ?? {};
  if (profile.active !== true) throw new AdminAuthError("Employee account is disabled.", 403);
  return { uid, profile, ref: snapshot.ref };
}
