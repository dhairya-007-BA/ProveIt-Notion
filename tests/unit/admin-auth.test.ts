import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AdminAuthDependencies,
  authorizeBOD,
} from "@/lib/admin-auth-core";
import { authenticatedRequest } from "@/lib/authenticated-request";

const BOD_UID = "bod-user";

function requestWithToken(token?: string) {
  return new Request(
    "http://localhost/api/admin/employees",
    {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : undefined,
    }
  );
}

function dependencies(
  profile: Record<string, unknown> | undefined = {
    active: true,
    role: "bod",
  }
): AdminAuthDependencies {
  return {
    expectedProjectId: "proveit-internal",
    verifyIdToken: vi.fn().mockResolvedValue({
      uid: BOD_UID,
      email: "bod@auth.proveit.internal",
    }),
    getUserProfile: vi.fn().mockResolvedValue(profile),
  };
}

describe("admin authentication", () => {
  it("allows a valid authenticated BOD", async () => {
    const authDependencies = dependencies();

    await expect(
      authorizeBOD(
        requestWithToken("valid-token"),
        "create-employee",
        authDependencies
      )
    ).resolves.toMatchObject({
      uid: BOD_UID,
      profile: {
        active: true,
        role: "bod",
      },
    });

    expect(
      authDependencies.verifyIdToken
    ).toHaveBeenCalledWith(
      "valid-token",
      true
    );
  });

  it("denies a request with no token", async () => {
    await expect(
      authorizeBOD(
        requestWithToken(),
        "create-employee",
        dependencies()
      )
    ).rejects.toMatchObject({
      message: "Authentication required.",
      status: 401,
    });
  });

  it("denies an invalid or expired token", async () => {
    const authDependencies = dependencies();

    vi.mocked(
      authDependencies.verifyIdToken
    ).mockRejectedValue({
      code: "auth/id-token-expired",
    });

    await expect(
      authorizeBOD(
        requestWithToken("expired-token"),
        "create-employee",
        authDependencies
      )
    ).rejects.toMatchObject({
      message: "Invalid or expired authentication.",
      status: 401,
    });
  });

  it("denies a revoked token", async () => {
    const authDependencies = dependencies();

    vi.mocked(
      authDependencies.verifyIdToken
    ).mockRejectedValue({
      code: "auth/id-token-revoked",
    });

    await expect(
      authorizeBOD(
        requestWithToken("revoked-token"),
        "reset-employee-password",
        authDependencies
      )
    ).rejects.toMatchObject({
      message: "Invalid or expired authentication.",
      status: 401,
    });
  });

  it("does not misclassify an Admin credential failure as a user token failure", async () => {
    const authDependencies = dependencies();

    vi.mocked(
      authDependencies.verifyIdToken
    ).mockRejectedValue({
      code: "unknown",
    });

    await expect(
      authorizeBOD(
        requestWithToken("valid-user-token"),
        "create-employee",
        authDependencies
      )
    ).rejects.toMatchObject({
      message:
        "Server authentication is temporarily unavailable.",
      status: 503,
    });

    expect(
      authDependencies.getUserProfile
    ).not.toHaveBeenCalled();
  });

  it("denies an authenticated non-BOD", async () => {
    await expect(
      authorizeBOD(
        requestWithToken("valid-token"),
        "create-employee",
        dependencies({
          active: true,
          role: "business_intern",
        })
      )
    ).rejects.toMatchObject({
      message: "BOD access required.",
      status: 403,
    });
  });

  it("uses the same BOD authentication for employee creation", async () => {
    await expect(
      authorizeBOD(
        requestWithToken("create-token"),
        "create-employee",
        dependencies()
      )
    ).resolves.toMatchObject({ uid: BOD_UID });
  });

  it("uses the same BOD authentication for password resets", async () => {
    await expect(
      authorizeBOD(
        requestWithToken("reset-token"),
        "reset-employee-password",
        dependencies()
      )
    ).resolves.toMatchObject({ uid: BOD_UID });
  });

  it("uses the verified token UID rather than a client-provided UID", async () => {
    await expect(
      authorizeBOD(
        new Request(
          "http://localhost/api/admin/employees?uid=attacker",
          {
            headers: {
              Authorization: "Bearer valid-token",
              "X-Employee-Uid": "attacker",
            },
          }
        ),
        "create-employee",
        dependencies()
      )
    ).resolves.toMatchObject({ uid: BOD_UID });
  });
});

describe("authenticatedRequest", () => {
  it("refreshes the Firebase token immediately before sending it", async () => {
    const getIdToken = vi.fn().mockResolvedValue(
      "fresh-token"
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response());

    await authenticatedRequest(
      { getIdToken },
      "/api/admin/employees",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    expect(getIdToken).toHaveBeenCalledWith(true);

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(headers.get("Authorization")).toBe(
      "Bearer fresh-token"
    );
    expect(headers.get("Content-Type")).toBe(
      "application/json"
    );
  });
});
