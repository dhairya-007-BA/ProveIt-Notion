import { describe, expect, it, vi } from "vitest";

import { createKaneoBusinessTask, KaneoTaskCreateError, preflightKaneoTask } from "@/lib/kaneo-task-create";

const config = { baseUrl: "http://kaneo.test", apiToken: "test-token", workspaceId: "workspace-1", projects: { business: "business-project", technology: "technology-project" } };

describe("production Kaneo task creation", () => {
  it("requires the fixed to-do column before a create", async () => {
    const getColumns = vi.fn().mockResolvedValue([{ projectId: "business-project", slug: "to-do", name: "To do" }]);
    await expect(preflightKaneoTask("business-project", { config, dependencies: { getColumns } })).resolves.toBeUndefined();
    expect(getColumns).toHaveBeenCalledWith("business-project", { config });
  });

  it("fails closed when the mapped project lacks to-do", async () => {
    await expect(preflightKaneoTask("business-project", { config, dependencies: { getColumns: vi.fn().mockResolvedValue([]) } })).rejects.toMatchObject({ status: 422 });
  });

  it("posts only normalized Business fields to the configured project", async () => {
    const post = vi.fn().mockResolvedValue({ id: "kaneo-1", projectId: "business-project", title: "Launch", status: "to-do", priority: "high" });
    await expect(createKaneoBusinessTask({ title: " Launch ", description: " Plan ", priority: "high" }, { config, dependencies: { getColumns: vi.fn().mockResolvedValue([{ projectId: "business-project", slug: "to-do" }]), post } })).resolves.toMatchObject({ id: "kaneo-1" });
    expect(post).toHaveBeenCalledWith("/api/task/business-project", { title: "Launch", description: "Plan", priority: "high", status: "to-do" }, { config });
  });

  it("uses no-priority only when a supported priority was omitted", async () => {
    const post = vi.fn().mockResolvedValue({ id: "kaneo-1", projectId: "business-project", title: "Launch", status: "to-do", priority: "no-priority" });
    await createKaneoBusinessTask({ title: "Launch" }, { config, dependencies: { getColumns: vi.fn().mockResolvedValue([{ projectId: "business-project", slug: "to-do" }]), post } });
    expect(post.mock.calls[0][1]).toMatchObject({ priority: "no-priority", status: "to-do" });
  });

  it("rejects malformed upstream task responses without leaking them", async () => {
    await expect(createKaneoBusinessTask({ title: "Launch" }, { config, dependencies: { getColumns: vi.fn().mockResolvedValue([{ projectId: "business-project", slug: "to-do" }]), post: vi.fn().mockResolvedValue({ id: "bad" }) } })).rejects.toBeInstanceOf(KaneoTaskCreateError);
  });
});
