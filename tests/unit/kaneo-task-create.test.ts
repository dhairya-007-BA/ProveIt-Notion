import { describe, expect, it, vi } from "vitest";

import { KaneoError } from "@/lib/kaneo";

import {
  createKaneoBusinessTask,
  createDisposableKaneoTask,
  DISPOSABLE_KANEO_TEST_DESCRIPTION,
  DISPOSABLE_KANEO_TEST_MARKER,
  DISPOSABLE_KANEO_TEST_PAYLOAD,
  preflightDisposableKaneoTask,
} from "@/lib/kaneo-task-create";

const config = {
  baseUrl: "http://kaneo.test",
  apiToken: "test-token",
  workspaceId: "workspace-1",
  projects: { business: "business-project", technology: "technology-project" },
};

describe("disposable Kaneo task creation", () => {
  it("uses a fixed payload with a deterministic non-secret marker", () => {
    expect(DISPOSABLE_KANEO_TEST_PAYLOAD).toEqual({
      title: "[PROVEIT INTEGRATION TEST] Disposable task",
      description: DISPOSABLE_KANEO_TEST_DESCRIPTION,
      priority: "no-priority",
      status: "to-do",
    });
    expect(DISPOSABLE_KANEO_TEST_MARKER).toBe("ProveIt integration marker: proveit-kaneo-test-business-v1");
  });

  it("allows creation only when the mapped project exposes to-do", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "To Do", slug: "to-do", position: 0, isFinal: false },
    ]);

    await expect(preflightDisposableKaneoTask("business-project", {
      config,
      dependencies: { getColumns },
    })).resolves.toBeUndefined();
    expect(getColumns).toHaveBeenCalledWith("business-project", { config });
  });

  it("rejects a project without to-do and does not select a fallback column", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-2", projectId: "business-project", name: "Backlog", slug: "backlog", position: 0, isFinal: false },
    ]);

    await expect(preflightDisposableKaneoTask("business-project", {
      config,
      dependencies: { getColumns },
    })).rejects.toMatchObject({ status: 422 });
  });

  it("posts only the fixed payload to the fixed task endpoint", async () => {
    const post = vi.fn().mockResolvedValue({
      id: "kaneo-task-1",
      projectId: "business-project",
      title: "[PROVEIT INTEGRATION TEST] Disposable task",
      status: "to-do",
      priority: "no-priority",
    });

    await expect(createDisposableKaneoTask("business-project", {
      config,
      dependencies: { post },
    })).resolves.toMatchObject({ id: "kaneo-task-1" });

    expect(post).toHaveBeenCalledWith(
      "/api/task/business-project",
      DISPOSABLE_KANEO_TEST_PAYLOAD,
      { config }
    );
  });

  it("treats a malformed success response as ambiguous", async () => {
    const post = vi.fn().mockResolvedValue({ id: "kaneo-task-1" });

    await expect(createDisposableKaneoTask("business-project", {
      config,
      dependencies: { post },
    })).rejects.toMatchObject({ status: 502, message: "Kaneo returned an invalid response." });
  });
});

describe("production Business Kaneo task creation", () => {
  const input = {
    title: "Launch plan",
    description: "Coordinate launch work.",
    priority: "high" as const,
  };

  it("uses immutable Business routing, preflights to-do, and posts once", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "To Do", slug: "to-do", position: 0, isFinal: false },
    ]);
    const post = vi.fn().mockResolvedValue({
      id: "kaneo-task-1",
      projectId: "business-project",
      title: "Launch plan",
      status: "to-do",
      priority: "high",
    });

    await expect(createKaneoBusinessTask(input, {
      config,
      dependencies: { getColumns, post },
    })).resolves.toEqual({
      id: "kaneo-task-1",
      projectId: "business-project",
      title: "Launch plan",
      status: "to-do",
      priority: "high",
    });
    expect(getColumns).toHaveBeenCalledWith("business-project", { config });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/task/business-project", {
      title: "Launch plan",
      description: "Coordinate launch work.",
      priority: "high",
      status: "to-do",
    }, { config });
  });

  it("maps an omitted priority to no-priority", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "To Do", slug: "to-do", position: 0, isFinal: false },
    ]);
    const post = vi.fn().mockResolvedValue({
      id: "kaneo-task-1", projectId: "business-project", title: "Launch plan", status: "to-do", priority: "no-priority",
    });

    await createKaneoBusinessTask({ title: "Launch plan" }, {
      config,
      dependencies: { getColumns, post },
    });
    expect(post).toHaveBeenCalledWith("/api/task/business-project", {
      title: "Launch plan", priority: "no-priority", status: "to-do",
    }, { config });
  });

  it("rejects invalid direct helper input before a Kaneo POST", async () => {
    const getColumns = vi.fn();
    const post = vi.fn();

    await expect(createKaneoBusinessTask({
      title: "Launch plan",
      priority: "critical" as never,
    }, { config, dependencies: { getColumns, post } })).rejects.toMatchObject({ status: 422 });
    expect(getColumns).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("does not post when to-do is absent", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "Backlog", slug: "backlog", position: 0, isFinal: false },
    ]);
    const post = vi.fn();

    await expect(createKaneoBusinessTask(input, {
      config,
      dependencies: { getColumns, post },
    })).rejects.toMatchObject({ status: 422 });
    expect(post).not.toHaveBeenCalled();
  });

  it("does not retry after a timeout", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "To Do", slug: "to-do", position: 0, isFinal: false },
    ]);
    const post = vi.fn().mockRejectedValue(new KaneoError("must-not-return", 503, "timeout"));

    await expect(createKaneoBusinessTask(input, {
      config,
      dependencies: { getColumns, post },
    })).rejects.toMatchObject({ category: "timeout" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed Kaneo responses", async () => {
    const getColumns = vi.fn().mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "To Do", slug: "to-do", position: 0, isFinal: false },
    ]);
    const post = vi.fn().mockResolvedValue({ id: "kaneo-task-1" });

    await expect(createKaneoBusinessTask(input, {
      config,
      dependencies: { getColumns, post },
    })).rejects.toMatchObject({ status: 502, message: "Kaneo returned an invalid response." });
  });
});
