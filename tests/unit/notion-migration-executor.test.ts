import { describe, expect, it } from "vitest";

import { NOTION_MIGRATION_EXECUTION_ENABLED, disabledMigrationExecution, migrationTaskPlan } from "@/lib/notion-migration-executor";

describe("Notion migration executor skeleton", () => {
  it("remains disabled and produces task plans with a structural Kaneo bypass", () => {
    expect(NOTION_MIGRATION_EXECUTION_ENABLED).toBe(false);
    expect(disabledMigrationExecution()).toMatchObject({ code: "migration_execution_not_authorized" });
    expect(migrationTaskPlan({ recordId: "r", sourceId: "s", sourceFingerprint: "f", normalizedFingerprint: "n", destinationWorkspaceId: "business", destinationEntityType: "task", idempotencyKey: "i", warnings: [] })).toMatchObject({ kaneoSync: "disabled", state: "planned" });
  });
});
