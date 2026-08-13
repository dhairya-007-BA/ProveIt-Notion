import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";

export class AdminAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export async function requireBOD(
  request: Request
) {
  const authorization =
    request.headers.get("authorization");

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new AdminAuthError(
      "Authentication required.",
      401
    );
  }

  const idToken = authorization.slice(7).trim();

  if (!idToken) {
    throw new AdminAuthError(
      "Authentication required.",
      401
    );
  }

  let decodedToken;

  try {
    decodedToken =
      await adminAuth.verifyIdToken(
        idToken,
        true
      );
  } catch (error) {
    console.error(
      "Failed to verify Firebase ID token:",
      error
    );

    throw new AdminAuthError(
      "Invalid or expired authentication.",
      401
    );
  }

  const userSnapshot = await adminDb
    .collection("users")
    .doc(decodedToken.uid)
    .get();

  if (!userSnapshot.exists) {
    throw new AdminAuthError(
      "Employee profile not found.",
      403
    );
  }

  const profile = userSnapshot.data();

  if (profile?.active !== true) {
    throw new AdminAuthError(
      "Employee account is disabled.",
      403
    );
  }

  if (profile?.role !== "bod") {
    throw new AdminAuthError(
      "BOD access required.",
      403
    );
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email ?? null,
    profile,
  };
}