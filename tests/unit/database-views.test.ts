import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDatabaseViewAccess, collection, DatabaseViewRouteError } = vi.hoisted(() => ({
  requireDatabaseViewAccess: vi.fn(),
  collection: vi.fn(),
  DatabaseViewRouteError: class DatabaseViewRouteError extends Error {
    constructor(public code: string) { super(code); }
  },
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn(() => "timestamp") } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection } }));
vi.mock("@/lib/database-view-route-auth", () => ({ requireDatabaseViewAccess, DatabaseViewRouteError }));
vi.mock("@/lib/custom-field-route-auth", () => ({
  CustomFieldAuthError: class CustomFieldAuthError extends Error { constructor(message: string, public status: 401 | 403 | 404 | 503, public code = status === 503 ? "custom_fields_server_authentication_unavailable" : "custom_fields_authorization_failed") { super(message); } },
}));

import { GET, POST } from "@/app/api/workspaces/[workspaceId]/databases/[databaseId]/views/route";
import { DELETE, PATCH } from "@/app/api/workspaces/[workspaceId]/databases/[databaseId]/views/[viewId]/route";

const context = { params: Promise.resolve({ workspaceId: "business", databaseId: "database-1" }) };
const viewContext = { params: Promise.resolve({ workspaceId: "business", databaseId: "database-1", viewId: "view-1" }) };
const database = { data: () => ({ properties: [{ id: "title", type: "title" }, { id: "score", type: "number" }] }) };
const state = { filters: [], sort: null, visiblePropertyIds: ["title", "score"], propertyOrder: ["title", "score"] };
function request(method = "GET", body?: unknown) { return new Request("http://localhost/api/workspaces/business/databases/database-1/views", { method, headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }

describe("saved view routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDatabaseViewAccess.mockResolvedValue({ actor: { uid: "member-1" }, database });
  });

  it("returns a successful empty result for a database with zero views", async () => {
    collection.mockReturnValue({ where: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) })) });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, views: [] });
    expect(collection).toHaveBeenCalledWith("databaseViews");
  });

  it("returns existing views from the established top-level collection", async () => {
    collection.mockReturnValue({ where: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [{ id: "view-1", data: () => ({ name: "Pipeline", databaseId: "database-1", workspaceId: "business", type: "table", filters: [], sort: null, visiblePropertyIds: ["title"], propertyOrder: ["title"] }) }] }) })) });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ success: true, views: [expect.objectContaining({ id: "view-1", name: "Pipeline" })] }));
  });

  it("rejects unauthenticated requests before any saved view query", async () => {
    const { CustomFieldAuthError } = await import("@/lib/custom-field-route-auth");
    requireDatabaseViewAccess.mockRejectedValue(new CustomFieldAuthError("Authentication required.", 401));
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ code: "database_views_authentication_failed" }));
    expect(collection).not.toHaveBeenCalled();
  });

  it("reports unavailable server authentication without mislabeling it as workspace access", async () => {
    const { CustomFieldAuthError } = await import("@/lib/custom-field-route-auth");
    requireDatabaseViewAccess.mockRejectedValue(new CustomFieldAuthError("Server authentication is temporarily unavailable.", 503));
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ code: "database_views_server_authentication_unavailable" }));
    expect(collection).not.toHaveBeenCalled();
  });

  it("returns a safe query failure code without exposing Firestore internals", async () => {
    collection.mockReturnValue({ where: vi.fn(() => ({ get: vi.fn().mockRejectedValue(new Error("sensitive upstream detail")) })) });
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ success: false, code: "database_views_query_failed", message: "Saved views could not be loaded." });
  });

  it("rejects a database from another workspace before the views query", async () => {
    const { CustomFieldAuthError } = await import("@/lib/custom-field-route-auth");
    requireDatabaseViewAccess.mockRejectedValue(new CustomFieldAuthError("Database not found.", 404));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(collection).not.toHaveBeenCalled();
  });

  it("creates only a validated view scoped by the server", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    collection.mockReturnValue({ doc: vi.fn(() => ({ id: "view-1", set })) });
    const response = await POST(request("POST", { name: "Pipeline", state }), context);
    expect(response.status).toBe(201);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ databaseId: "database-1", workspaceId: "business", createdBy: "member-1", name: "Pipeline" }));
  });

  it("rejects malformed view state without writing", async () => {
    const set = vi.fn();
    collection.mockReturnValue({ doc: vi.fn(() => ({ id: "view-1", set })) });
    const response = await POST(request("POST", { name: "Pipeline", state: { ...state, visiblePropertyIds: ["other-workspace-property"] } }), context);
    expect(response.status).toBe(400);
    expect(set).not.toHaveBeenCalled();
  });

  it("persists validated filter and sort state", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    collection.mockReturnValue({ doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ databaseId: "database-1", workspaceId: "business", type: "table" }) }), update })) });
    const configured = { ...state, filters: [{ id: "filter-1", propertyId: "score", operator: "greater_than", value: "4" }], sort: { propertyId: "score", direction: "desc" } };
    const response = await PATCH(request("PATCH", { state: configured }), viewContext);
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining(configured));
  });

  it("rejects cross-workspace saved view spoofing", async () => {
    const remove = vi.fn();
    collection.mockReturnValue({ doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ databaseId: "database-1", workspaceId: "technology", type: "table" }) }), delete: remove })) });
    const response = await DELETE(request("DELETE"), viewContext);
    expect(response.status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes a valid saved view", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    collection.mockReturnValue({ doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ databaseId: "database-1", workspaceId: "business", type: "table" }) }), delete: remove })) });
    const response = await DELETE(request("DELETE"), viewContext);
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledOnce();
  });
});
