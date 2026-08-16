import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminDb: {} }));
vi.mock("@/lib/kaneo", () => ({ getKaneoConfig: vi.fn(), getKaneoTasks: vi.fn() }));
vi.mock("@/app/api/integrations/kaneo/tasks/route", () => ({ POST: vi.fn() }));
vi.mock("@/app/api/integrations/kaneo/tasks/[taskId]/route", () => ({ DELETE: vi.fn(), PATCH: vi.fn() }));

import { controlledWorkspaceRequest } from "@/lib/kaneo-controlled-verification";

describe("controlled Kaneo workspace request", () => {
  it("replaces an existing workspace query instead of appending a second value", () => {
    const request = new Request("http://localhost/api/integrations/kaneo/controlled-test?workspaceId=technology", {
      headers: { Authorization: "Bearer test-token" },
    });

    const routed = controlledWorkspaceRequest(request, "technology");

    expect(new URL(routed.url).searchParams.getAll("workspaceId")).toEqual(["technology"]);
    expect(new URL(routed.url).searchParams.get("workspaceId")).toBe("technology");
    expect(routed.headers.get("authorization")).toBe("Bearer test-token");
  });

  it("cannot route a controlled Technology request to the Business project key", () => {
    const request = new Request("http://localhost/api/integrations/kaneo/controlled-test?workspaceId=business");

    const routed = controlledWorkspaceRequest(request, "technology");

    expect(new URL(routed.url).searchParams.getAll("workspaceId")).toEqual(["technology"]);
  });
});
