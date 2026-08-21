import { describe, expect, it } from "vitest";

import { workspaceModules } from "@/components/app-navigation";
import { TASK_PRIORITY_META, TASK_STATUS_META } from "@/components/ui/task-metadata";
import { cn } from "@/components/ui/utils";

describe("shared design-system metadata", () => {
  it("defines every canonical task status with a readable label and semantic class", () => {
    expect(Object.keys(TASK_STATUS_META)).toEqual(["todo", "in_progress", "blocked", "done"]);
    expect(Object.values(TASK_STATUS_META).every((item) => item.label.length > 0 && item.className.startsWith("proveit-task-status-"))).toBe(true);
  });

  it("defines every supported priority", () => {
    expect(Object.keys(TASK_PRIORITY_META)).toEqual(["low", "medium", "high", "urgent"]);
    expect(TASK_PRIORITY_META.urgent.label).toBe("Urgent");
  });

  it("keeps desktop and mobile workspace navigation on one ordered model", () => {
    expect(workspaceModules.map((module) => module.id)).toEqual(["dashboard", "inbox", "documents", "tasks", "meetings", "databases", "activity"]);
    expect(new Set(workspaceModules.map((module) => module.id)).size).toBe(workspaceModules.length);
  });

  it("joins optional component classes without leaking false values", () => {
    expect(cn("base", false, undefined, "active", null)).toBe("base active");
  });
});
