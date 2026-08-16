import { describe, expect, it } from "vitest";
import { activityHref } from "@/lib/activity-link";

describe("activity links", () => {
  it("resolves supported workspace entities without exposing IDs as text", () => {
    expect(activityHref({ workspaceId: "business", entityType: "task", entityId: "task-1" })).toBe("/workspaces/business/tasks?task=task-1");
    expect(activityHref({ workspaceId: "company", entityType: "document", entityId: "doc-1" })).toBe("/workspaces/company/documents/doc-1");
    expect(activityHref({ workspaceId: "technology", entityType: "meeting", entityId: "meeting-1" })).toBe("/workspaces/technology/meetings/meeting-1");
  });
  it("keeps historical activity non-clickable when target metadata is insufficient", () => {
    expect(activityHref({ workspaceId: "business", entityType: "task" })).toBeNull();
    expect(activityHref({ workspaceId: "business", entityType: "database-row", entityId: "invalid" })).toBeNull();
    expect(activityHref({ workspaceId: "business", entityType: "workspace", entityId: "business" })).toBeNull();
  });
});
