import { describe, expect, it } from "vitest";

import { buildNotionMigrationManifest } from "@/lib/notion-migration-preview";
import { migrationReadiness, migrationReviewSummary, validateMigrationResolution } from "@/lib/notion-migration-resolutions";
import type { NotionExportModel } from "@/lib/notion-import";

const model: NotionExportModel = {
  pages: [], assets: [], warnings: [], unsupportedFiles: 0, sourceFiles: 0, internalLinks: 0, duplicateSourceIds: [],
  databases: [{ sourceId: "db-1", sourcePath: "Business/Tasks.csv", name: "Tasks", candidateKind: "task_database", rowCount: 1, relatedPageCount: 0, properties: [{ name: "Status", type: "single_select", nonEmptyCount: 1, sampleValues: ["Waiting on Documents/On Hold"] }, { name: "Assignee", type: "person", nonEmptyCount: 1, sampleValues: ["Unknown"] }], rows: [{ Status: "Waiting on Documents/On Hold", Assignee: "Unknown" }] }],
};

describe("Notion migration resolutions", () => {
  it("keeps only records that require deferred people in review", () => {
    const manifest = buildNotionMigrationManifest(model, [], "a".repeat(64));
    expect(migrationReadiness(manifest, []).importLocked).toBe(true);
    const values = [
      { type: "person" as const, key: "Unknown", value: { employeeId: null } },
      { type: "status" as const, key: "Waiting on Documents/On Hold", value: { choice: "raw" } },
      { type: "property" as const, key: "db-1:Status", value: { choice: "raw" } },
      { type: "property" as const, key: "db-1:Assignee", value: { choice: "raw" } },
    ];
    const readiness = migrationReadiness(manifest, values);
    expect(readiness.importLocked).toBe(true);
    expect(readiness.records.find((record) => record.sourceKind === "database_row")?.readiness).toBe("needs_review");
  });

  it("allows only bounded, explicitly confirmed decisions", () => {
    expect(validateMigrationResolution({ type: "property", key: "db:field", value: { choice: "skip" } })).toBeNull();
    expect(validateMigrationResolution({ type: "property", key: "db:field", value: { choice: "skip", confirmSkip: true } })).toMatchObject({ type: "property" });
    expect(validateMigrationResolution({ type: "workspace", key: "db", value: { workspaceId: "other" } })).toBeNull();
    expect(validateMigrationResolution({ type: "document", key: "doc", value: { choice: "approve_with_warning" } })).toMatchObject({ type: "document" });
  });

  it("uses persisted workspace decisions consistently in dashboard facts and readiness", () => {
    const manifest = buildNotionMigrationManifest(model, [], "a".repeat(64));
    const decisions = [{ type: "workspace" as const, key: "db-1", value: { workspaceId: "business" } }];
    expect(migrationReviewSummary(manifest, decisions).workspaces).toMatchObject({ resolved: 1, remaining: 0 });
    expect(migrationReadiness(manifest, decisions).importLocked).toBe(true);
  });

  it("reports document blockers separately without making a warning-safe document ready by default", () => {
    const source: NotionExportModel = { ...model, databases: [], pages: [
      { sourceId: "safe-document", sourcePath: "Business/Plan.html", title: "Plan", parentPath: "Business", contentHtml: "<p>Plan</p>", internalLinkCount: 0, databaseRowPage: false },
      { sourceId: "blocked-document", sourcePath: "Business/Table.html", title: "Table", parentPath: "Business", contentHtml: "<table><tr><td>Value</td></tr></table>", internalLinkCount: 0, databaseRowPage: false },
    ] };
    const manifest = buildNotionMigrationManifest(source, [], "b".repeat(64));
    const summary = migrationReviewSummary(manifest, []);
    expect(summary.documents).toMatchObject({ total: 2, safeWithWarning: 1, blocked: 1, approvedWithWarning: 0, categories: { embedded_database: 1 } });
    expect(migrationReadiness(manifest, []).records.find((record) => record.sourceId === "safe-document")?.readiness).toBe("needs_review");
  });
});
