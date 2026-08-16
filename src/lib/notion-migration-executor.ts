import "server-only";

/**
 * Execution design only. This module deliberately contains no task-creation or
 * Kaneo import: a later, separately authorized phase will supply those writes.
 */
export type NotionImportBatch = {
  batchId: string;
  sourceFingerprint: string;
  state: "planned" | "authorized" | "running" | "completed" | "failed";
  dryRun: boolean;
};

export type NotionImportRecord = {
  recordId: string;
  sourceId: string;
  sourceFingerprint: string;
  normalizedFingerprint: string;
  destinationWorkspaceId: "business" | "technology" | "company" | "board";
  destinationEntityType: "task" | "meeting" | "document" | "database";
  idempotencyKey: string;
  state: "planned" | "blocked" | "imported" | "failed";
  warnings: string[];
  kaneoSync: "disabled";
};

export const NOTION_MIGRATION_EXECUTION_ENABLED = false;

export function disabledMigrationExecution() {
  return {
    success: false as const,
    code: "migration_execution_not_authorized" as const,
    message: "Notion migration execution has not been authorized.",
  };
}

/** A structural invariant used by executor tests before real writes are approved. */
export function migrationTaskPlan(input: Omit<NotionImportRecord, "kaneoSync" | "state">): NotionImportRecord {
  return { ...input, state: "planned", kaneoSync: "disabled" };
}
