import { describe, expect, it, vi } from "vitest";

import { syncBusinessTaskDelete, syncBusinessTaskUpdate } from "@/lib/kaneo-business-task-update-sync";

const user = { getIdToken: vi.fn() };
const endpoint = "/api/integrations/kaneo/tasks/proveit-task-1";
function response(status: number, body: unknown = {}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

describe("Business mapped-task browser bridge", () => {
  it("uses one PATCH with only allowed changed fields", async () => {
    const request = vi.fn().mockResolvedValue(response(200, { success: true, state: "synced" }));
    await expect(syncBusinessTaskUpdate(user, "business", "proveit-task-1", ["title"], { request })).resolves.toMatchObject({ state: "synced" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(user, endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: ["title"] }) });
  });

  it.each(["technology", "company", "board"]) ("makes zero update/delete requests for %s", async (workspaceId) => {
    const request = vi.fn();
    await expect(syncBusinessTaskUpdate(user, workspaceId, "proveit-task-1", ["title"], { request })).resolves.toBeNull();
    await expect(syncBusinessTaskDelete(user, workspaceId, "proveit-task-1", { request })).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("permits local deletion only after one definite remote success", async () => {
    const request = vi.fn().mockResolvedValue(response(200, { success: true, state: "synced" }));
    await expect(syncBusinessTaskDelete(user, "business", "proveit-task-1", { request })).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(user, endpoint, { method: "DELETE" });
  });

  it.each([
    ["definite remote failure", vi.fn().mockResolvedValue(response(502))],
    ["ambiguous network failure", vi.fn().mockRejectedValue(new Error("network"))],
  ])("preserves the local task after %s with no retry", async (_name, request) => {
    await expect(syncBusinessTaskDelete(user, "business", "proveit-task-1", { request })).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
