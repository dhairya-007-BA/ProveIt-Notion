import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireBod, run, KaneoRouteAuthError } = vi.hoisted(() => ({
  requireBod: vi.fn(), run: vi.fn(),
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceDeleteAccess: requireBod }));
vi.mock("@/lib/kaneo-controlled-verification", () => ({ runControlledWorkspaceSyncTest: run }));
vi.mock("@/lib/kaneo-routing", () => ({ getKaneoProjectKeyForWorkspace: (workspaceId: string) => workspaceId }));

import { POST } from "@/app/api/integrations/kaneo/controlled-test/route";

const request = () => new Request("http://localhost/api/integrations/kaneo/controlled-test", {
  method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
  body: JSON.stringify({ confirmation: "RUN_CONTROLLED_BUSINESS_SYNC_TEST" }),
});

describe("development-only controlled Kaneo lifecycle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBod.mockResolvedValue({ uid: "bod-user" });
    run.mockResolvedValue({ message: "Controlled Workspace Sync Test completed." });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled outside development without authorizing or mutating", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(404);
    expect(requireBod).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("requires BOD authorization before the one controlled lifecycle can run", async () => {
    vi.stubEnv("NODE_ENV", "development");
    requireBod.mockRejectedValue(new KaneoRouteAuthError("Business task deletion requires BOD access.", 403));
    expect((await POST(request())).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("passes only the authenticated BOD identity to the controlled lifecycle", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith(expect.any(Request), "bod-user", "business");
  });

  it("passes the immutable Technology workspace key only when explicitly selected", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const technologyRequest = new Request("http://localhost/api/integrations/kaneo/controlled-test?workspaceId=technology", {
      method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "RUN_CONTROLLED_TECHNOLOGY_SYNC_TEST" }),
    });
    await POST(technologyRequest);
    expect(requireBod).toHaveBeenCalledWith(technologyRequest, "technology");
    expect(run).toHaveBeenCalledWith(technologyRequest, "bod-user", "technology");
  });
});
