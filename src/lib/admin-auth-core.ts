export type DecodedAdminToken = {
  uid: string;
  email?: string;
};

export type AdminUserProfile = {
  active?: unknown;
  role?: unknown;
  [key: string]: unknown;
};

export interface AdminAuthDependencies {
  expectedProjectId: string;
  verifyIdToken: (
    idToken: string,
    checkRevoked: boolean
  ) => Promise<DecodedAdminToken>;
  getUserProfile: (
    uid: string
  ) => Promise<AdminUserProfile | undefined>;
}

export class AdminAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

function firebaseErrorCode(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "unknown";
}

/**
 * These errors mean the server could not authenticate itself to Firebase.
 * They must not be reported as a problem with the employee's ID token.
 */
export function isAdminCredentialFailure(
  error: unknown
) {
  const code = firebaseErrorCode(error);

  return code === "unknown" ||
    code.startsWith("app/") ||
    code === "auth/invalid-credential" ||
    code === "auth/insufficient-permission" ||
    code === "auth/internal-error";
}

export async function authorizeBOD(
  request: Request,
  operation: string,
  dependencies: AdminAuthDependencies
) {
  const authorization =
    request.headers.get("authorization");
  const authorizationPresent =
    Boolean(authorization);

  console.info("Admin authentication request", {
    operation,
    expectedProjectId:
      dependencies.expectedProjectId,
    authorizationPresent,
  });

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

  let decodedToken: DecodedAdminToken;

  try {
    decodedToken =
      await dependencies.verifyIdToken(
        idToken,
        true
      );
  } catch (error: unknown) {
    const errorCode = firebaseErrorCode(error);
    const credentialFailure =
      isAdminCredentialFailure(error);

    console.warn("Firebase ID token verification failed", {
      operation,
      expectedProjectId:
        dependencies.expectedProjectId,
      authorizationPresent,
      errorCategory: credentialFailure
        ? "admin-credential-unavailable"
        : "invalid-user-token",
      firebaseErrorCode: errorCode,
    });

    if (credentialFailure) {
      throw new AdminAuthError(
        "Server authentication is temporarily unavailable.",
        503
      );
    }

    throw new AdminAuthError(
      "Invalid or expired authentication.",
      401
    );
  }

  console.info("Firebase ID token verified", {
    operation,
    expectedProjectId:
      dependencies.expectedProjectId,
    verifiedUid: decodedToken.uid,
  });

  const profile =
    await dependencies.getUserProfile(
      decodedToken.uid
    );

  if (!profile) {
    throw new AdminAuthError(
      "Employee profile not found.",
      403
    );
  }

  if (profile.active !== true) {
    throw new AdminAuthError(
      "Employee account is disabled.",
      403
    );
  }

  if (profile.role !== "bod") {
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
