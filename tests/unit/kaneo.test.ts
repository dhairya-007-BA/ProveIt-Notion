import { describe, expect, it, vi } from "vitest";

import {
  getKaneoConfig,
  getKaneoTasks,
  kaneoDelete,
  kaneoGet,
  type KaneoConfig,
} from "@/lib/kaneo";

const config: KaneoConfig = {
  baseUrl: "http://kaneo.test",
  apiToken: "test-token",
  workspaceId: "kaneo-workspace",
  projects: { business: "business-project", technology: "technology-project" },
};

describe("Kaneo configuration", () => {
  it("fails safely when required configuration is absent", () => {
    expect(() => getKaneoConfig({})).toThrow("not configured");
  });

  it("does not expose configuration values in a missing-variable error", () => {
    expect(() => getKaneoConfig({ KANEO_BASE_URL: "https://kaneo.test" })).toThrow("not configured");
  });
});

describe("Kaneo requests", () => {
  it("uses the verified x-api-key header without an Authorization header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
    await kaneoGet("/api/health", { config, fetcher });
    const [, init] = fetcher.mock.calls[0];
    expect(init.headers).toEqual({ Accept: "application/json", "x-api-key": "test-token" });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("normalizes unavailable upstream requests", async () => {
    await expect(kaneoGet("/api/health", { config, fetcher: vi.fn().mockRejectedValue(new Error("offline")) })).rejects.toMatchObject({ status: 503, message: "Kaneo service is unavailable." });
  });

  it("rejects malformed task responses", async () => {
    await expect(getKaneoTasks("business-project", {
      config,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { columns: [{ tasks: [{ id: "x" }] }] } }))),
    })).rejects.toMatchObject({ status: 502, message: "Kaneo returned an invalid response." });
  });

  it("accepts Kaneo's JSON DELETE response", async () => {
    await expect(kaneoDelete("/api/task/task-1", {
      config,
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "task-1" }))),
    })).resolves.toEqual({ id: "task-1" });
  });

  it("also accepts an empty successful DELETE response without weakening JSON validation for reads", async () => {
    await expect(kaneoDelete("/api/task/task-1", {
      config,
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    })).resolves.toBeNull();
    await expect(kaneoGet("/api/health", {
      config,
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    })).rejects.toMatchObject({ category: "malformed_response" });
  });
});
