import { describe, expect, it, vi } from "vitest";

import { syncWorkspaceTaskToKaneo } from "@/lib/kaneo-business-task-sync";
import { syncWorkspaceTaskDelete, syncWorkspaceTaskUpdate } from "@/lib/kaneo-business-task-update-sync";

const user = { getIdToken: vi.fn() };

describe("Technology Kaneo browser bridge", () => {
  it("sends one Technology create with only the approved task payload", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    await expect(syncWorkspaceTaskToKaneo(user, "technology", { proveItTaskId: "task-1", title: "Technology launch", description: "Plan", priority: "high" }, { request })).resolves.toBe("synced");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(user, "/api/integrations/kaneo/tasks?workspaceId=technology", expect.objectContaining({
      method: "POST", body: JSON.stringify({ proveItTaskId: "task-1", title: "Technology launch", description: "Plan", priority: "high" }),
    }));
  });

  it("sends one Technology update/delete through the fixed workspace route", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ success: true, state: "synced" }) });
    await expect(syncWorkspaceTaskUpdate(user, "technology", "task-1", ["title"], { request })).resolves.toMatchObject({ state: "synced" });
    await expect(syncWorkspaceTaskDelete(user, "technology", "task-1", { request })).resolves.toBe(true);
    expect(request).toHaveBeenNthCalledWith(1, user, "/api/integrations/kaneo/tasks/task-1?workspaceId=technology", expect.objectContaining({ method: "PATCH" }));
    expect(request).toHaveBeenNthCalledWith(2, user, "/api/integrations/kaneo/tasks/task-1?workspaceId=technology", { method: "DELETE" });
  });

  it.each(["company", "board"]) ("makes no Kaneo request for %s", async (workspaceId) => {
    const request = vi.fn();
    await expect(syncWorkspaceTaskToKaneo(user, workspaceId, { title: "No sync", description: "", priority: undefined }, { request })).resolves.toBe("not_applicable");
    await expect(syncWorkspaceTaskUpdate(user, workspaceId, "task-1", ["title"], { request })).resolves.toBeNull();
    await expect(syncWorkspaceTaskDelete(user, workspaceId, "task-1", { request })).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});
