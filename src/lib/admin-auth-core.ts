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
    const firebaseErrorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "unknown";

    console.warn("Firebase ID token verification failed", {
      operation,
      expectedProjectId:
        dependencies.expectedProjectId,
      authorizationPresent,
      firebaseErrorCode,
    });

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
