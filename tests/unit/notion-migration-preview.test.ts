import { describe, expect, it } from "vitest";

import { buildNotionMigrationManifest, reviewNotionDocument } from "@/lib/notion-migration-preview";
import type { NotionExportModel } from "@/lib/notion-import";

function model(): NotionExportModel {
  return { pages: [{ sourceId: "page-1", sourcePath: "Business/Plan.html", title: "Plan", parentPath: "Business", contentHtml: "<p>Plan</p>", internalLinkCount: 1, databaseRowPage: false }], databases: [{ sourceId: "task-db", sourcePath: "Business/Tasks Tracker.csv", name: "Tasks Tracker", candidateKind: "task_database", rowCount: 2, properties: [{ name: "Task name", type: "text", nonEmptyCount: 2, sampleValues: ["Ship"] }, { name: "Assignee", type: "person", nonEmptyCount: 2, sampleValues: ["nadia@proveit.test"] }, { name: "Priority", type: "single_select", nonEmptyCount: 2, sampleValues: ["High"] }], rows: [{ "Task name": "Ship", Assignee: "nadia@proveit.test", Priority: "High" }, { "Task name": "Ship", Assignee: "nadia@proveit.test", Priority: "High" }], relatedPageCount: 0 }], assets: [{ sourceId: "asset-1", sourcePath: "Business/logo.png", extension: "png", bytes: 5 }], warnings: [], unsupportedFiles: 0, sourceFiles: 0, internalLinks: 1, duplicateSourceIds: [] };
}

describe("Notion migration preview manifest", () => {
  it("creates deterministic batch and record identifiers without import writes", () => {
    const first = buildNotionMigrationManifest(model(), [{ employeeId: "P-001", email: "nadia@proveit.test" }], "source-fingerprint");
    const second = buildNotionMigrationManifest(model(), [{ employeeId: "P-001", email: "nadia@proveit.test" }], "source-fingerprint");
    expect(first.batchId).toBe(second.batchId);
    expect(first.records.map((record) => record.recordId)).toEqual(second.records.map((record) => record.recordId));
    expect(first).toMatchObject({ dryRun: true, importDesign: { conflictPolicy: "never_merge_conflicting_records", importedTaskKaneoSync: "disabled" } });
  });

  it("maps only unique people and blocks duplicate records from import", () => {
    const manifest = buildNotionMigrationManifest(model(), [{ employeeId: "P-001", email: "nadia@proveit.test" }], "source-fingerprint");
    const rows = manifest.records.filter((record) => record.sourceKind === "database_row");
    expect(rows).toHaveLength(2);
    expect(rows.every((record) => record.destinationWorkspaceId === "business" && record.destinationEntityType === "task")).toBe(true);
    expect(rows.every((record) => record.duplicateState === "duplicate_record" && record.safeToImport === false)).toBe(true);
    expect(rows[0].personMappings).toMatchObject([{ property: "Assignee", source: "nadia@proveit.test", status: "matched", employeeId: "P-001", matchingReason: "exact_work_email" }]);
  });

  it("distinguishes warning-safe text documents from material representation blockers", () => {
    const safe = reviewNotionDocument({ sourceId: "page-safe", sourcePath: "Business/Plan.html", title: "Plan", parentPath: "Business", contentHtml: "<h1>Plan</h1><p>Ship the release.</p><a href=\"other.html\">Related</a>", internalLinkCount: 1, databaseRowPage: false }, []);
    expect(safe).toMatchObject({ safeWithWarning: true, categories: expect.arrayContaining(["representable_rich_text", "unresolved_internal_links"]), representableText: expect.stringContaining("Ship the release.") });

    const blocked = reviewNotionDocument({ sourceId: "page-blocked", sourcePath: "Business/Report.html", title: "Report", parentPath: "Business", contentHtml: "<table><tr><td>Budget</td></tr></table><img src=\"invoice.pdf\">", internalLinkCount: 0, databaseRowPage: false }, []);
    expect(blocked).toMatchObject({ safeWithWarning: false, categories: expect.arrayContaining(["embedded_database", "asset_dependency"]) });
  });

  it("keeps repeated source candidates distinct and supplies a conflict set", () => {
    const source = model();
    source.pages.push({ ...source.pages[0], sourcePath: "Business/Plan copy.html", title: "Changed Plan" });
    const manifest = buildNotionMigrationManifest(source, [], "source-fingerprint");
    const pages = manifest.records.filter((record) => record.sourceKind === "page");
    expect(new Set(pages.map((record) => record.recordId)).size).toBe(2);
    expect(manifest.duplicateSets).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: "page-1", classification: "conflicting", differences: expect.arrayContaining(["title/name"]) })]));
  });

  it("requires review when workspace or person resolution is not deterministic", () => {
    const source = model(); source.databases[0].sourcePath = "Unsorted/Tasks Tracker.csv"; source.databases[0].rows = [{ "Task name": "Review", Assignee: "Unknown", Priority: "Low" }]; source.databases[0].rowCount = 1;
    const manifest = buildNotionMigrationManifest(source, [], "source-fingerprint");
    const row = manifest.records.find((record) => record.sourceKind === "database_row");
    expect(row).toMatchObject({ destinationWorkspaceId: null, state: "needs_review", safeToImport: false, personMappings: [{ status: "unresolved" }] });
  });

  it("recognizes the explicit ProveIT Tech Team while keeping an employee directory as a database", () => {
    const source = model();
    source.databases[0].name = "Untitled";
    source.databases[0].sourcePath = "ProveIT Tech Team/ProveIt Employee directory/Untitled.csv";
    source.databases[0].rows = [{ "Task name": "Nadia", Assignee: "", Priority: "" }]; source.databases[0].rowCount = 1;
    const manifest = buildNotionMigrationManifest(source, [], "source-fingerprint");
    const row = manifest.records.find((record) => record.sourceKind === "database_row");
    expect(row).toMatchObject({ destinationWorkspaceId: "technology", destinationEntityType: "database", state: "ready", safeToImport: true });
  });
});
