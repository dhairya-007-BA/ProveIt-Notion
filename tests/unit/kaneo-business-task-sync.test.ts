import { describe, expect, it, vi } from "vitest";

import {
  createProveItTaskThenSyncBusinessKaneo,
  createTaskSubmissionGuard,
  syncBusinessTaskToKaneo,
} from "@/lib/kaneo-business-task-sync";

const user = { getIdToken: vi.fn() };
const input = { title: "Launch plan", description: "Coordinate launch work.", priority: "high" };
const endpoint = "/api/integrations/kaneo/tasks";

function response(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Business task Kaneo sync", () => {
  it("blocks rapid duplicate submission until a failed ProveIt create is released", () => {
    const guard = createTaskSubmissionGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });

  it("posts exactly once for Business with only the allowed payload", async () => {
    const request = vi.fn().mockResolvedValue(response(200));

    await expect(syncBusinessTaskToKaneo(user, "business", input, { request })).resolves.toBe("synced");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(user, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  });

  it("preserves the completed ProveIt task and normal success result", async () => {
    const request = vi.fn().mockResolvedValue(response(200));
    const createProveItTask = vi.fn().mockResolvedValue("proveit-task-1");

    await expect(createProveItTaskThenSyncBusinessKaneo(
      createProveItTask, user, "business", input, { request }
    )).resolves.toEqual({ proveItTaskId: "proveit-task-1", kaneoSync: "synced" });
    expect(createProveItTask).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["technology", "company", "board", "other"])
  ("does not post for %s", async (workspaceId) => {
    const request = vi.fn();
    await expect(syncBusinessTaskToKaneo(user, workspaceId, input, { request })).resolves.toBe("not_applicable");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not sync when ProveIt task creation fails", async () => {
    const request = vi.fn();
    const createProveItTask = vi.fn().mockRejectedValue(new Error("Firestore failure"));

    await expect(createProveItTaskThenSyncBusinessKaneo(
      createProveItTask, user, "business", input, { request }
    )).rejects.toThrow("Firestore failure");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ["4xx", response(422)],
    ["5xx", response(503, { message: "Kaneo service could not complete the request." })],
  ])("keeps the completed ProveIt task after a definite Kaneo %s failure", async (_name, upstreamResponse) => {
    const request = vi.fn().mockResolvedValue(upstreamResponse);
    const createProveItTask = vi.fn().mockResolvedValue("proveit-task-1");

    await expect(createProveItTaskThenSyncBusinessKaneo(
      createProveItTask, user, "business", input, { request }
    )).resolves.toEqual({ proveItTaskId: "proveit-task-1", kaneoSync: "failed" });
    expect(createProveItTask).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("returns an ambiguous result for a network failure without retrying", async () => {
    const request = vi.fn().mockRejectedValue(new Error("network failure"));

    await expect(syncBusinessTaskToKaneo(user, "business", input, { request })).resolves.toBe("ambiguous");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("returns an ambiguous result for the server's safe ambiguous response", async () => {
    const request = vi.fn().mockResolvedValue(response(503, {
      message: "Kaneo task creation outcome is ambiguous and will not be retried automatically.",
    }));

    await expect(syncBusinessTaskToKaneo(user, "business", input, { request })).resolves.toBe("ambiguous");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("omits unsupported priority values", async () => {
    const request = vi.fn().mockResolvedValue(response(200));

    await syncBusinessTaskToKaneo(user, "business", { ...input, priority: "unsupported" }, { request });
    expect(JSON.parse(request.mock.calls[0][2].body)).toEqual({
      title: "Launch plan",
      description: "Coordinate launch work.",
    });
  });
});
