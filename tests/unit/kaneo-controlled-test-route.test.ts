import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireBod, run, KaneoRouteAuthError } = vi.hoisted(() => ({ requireBod: vi.fn(), run: vi.fn(), KaneoRouteAuthError: class KaneoRouteAuthError extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/lib/kaneo-route-auth", () => ({ requireKaneoBusinessDeleteAccess: requireBod, KaneoRouteAuthError }));
vi.mock("@/lib/kaneo-controlled-verification", () => ({ runControlledBusinessSyncTest: run }));

import { POST } from "@/app/api/integrations/kaneo/controlled-test/route";

function request(body: unknown = { confirmation: "RUN_CONTROLLED_BUSINESS_SYNC_TEST" }) { return new Request("http://localhost/api/integrations/kaneo/controlled-test", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
const complete = { message: "Controlled Business Sync Test completed." };

describe("controlled Business sync route", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); vi.clearAllMocks(); requireBod.mockResolvedValue({ uid: "bod-1" }); run.mockResolvedValue(complete); });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects production before authentication or mutations", async () => { vi.stubEnv("NODE_ENV", "production"); expect((await POST(request())).status).toBe(404); expect(requireBod).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); });
  it("rejects unauthenticated or non-BOD callers before the lifecycle", async () => { requireBod.mockRejectedValue(new KaneoRouteAuthError("Business task deletion requires BOD access.", 403)); const response = await POST(request()); expect(response.status).toBe(403); expect(run).not.toHaveBeenCalled(); });
  it.each([{ confirmation: "RUN_CONTROLLED_BUSINESS_SYNC_TEST", kaneoTaskId: "attacker" }, { confirmation: "RUN_CONTROLLED_BUSINESS_SYNC_TEST", projectId: "attacker" }, { confirmation: "RUN_CONTROLLED_BUSINESS_SYNC_TEST", credentials: "attacker" }])("rejects browser-owned integration data", async (body) => { expect((await POST(request(body))).status).toBe(422); expect(run).not.toHaveBeenCalled(); });
  it("runs exactly one server-derived lifecycle and exposes only the safe result", async () => { const response = await POST(request()); expect(response.status).toBe(200); expect(run).toHaveBeenCalledTimes(1); expect(run).toHaveBeenCalledWith(expect.any(Request), "bod-1"); expect(await response.json()).toEqual({ success: true, result: complete, message: complete.message }); });
});
