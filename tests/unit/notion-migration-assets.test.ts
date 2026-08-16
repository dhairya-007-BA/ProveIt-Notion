import { describe, expect, it } from "vitest";

import { NOTION_MIGRATION_ASSET_LIMITS, planNotionAssetMigration } from "@/lib/notion-migration-assets";

describe("Notion asset migration plan", () => {
  it("creates a safe, server-only blocked plan without trusted source filenames", () => {
    const plan = planNotionAssetMigration({ sourceFingerprint: "a".repeat(64), sourceId: "asset-1", sourcePath: "Business/../../invoice.pdf", extension: "pdf", bytes: 20 });
    expect(plan).toMatchObject({ state: "blocked", uploadMode: "server_authorized_only", provenance: "notion_export", contentType: "application/pdf" });
    expect(plan.destinationPathTemplate).not.toContain("..");
    expect(plan.safeFileName).not.toContain("invoice");
    expect(plan.contentHash).toBeNull();
    expect(plan.duplicateDetection).toBe("source_identity_before_read_then_content_sha256");
    expect(plan.attachmentOrder).toBe("destination_entity_must_exist_before_attachment");
    expect(plan.retryPolicy).toBe("no_automatic_retry_operator_reconciliation_required");
    expect(NOTION_MIGRATION_ASSET_LIMITS.maxBytes).toBeGreaterThan(0);
  });

  it("keeps unsupported or oversized assets blocked without reading or uploading bytes", () => {
    const plan = planNotionAssetMigration({ sourceFingerprint: "b".repeat(64), sourceId: "asset-2", sourcePath: "Business/archive.exe", extension: "exe", bytes: NOTION_MIGRATION_ASSET_LIMITS.maxBytes + 1 });
    expect(plan).toMatchObject({ state: "blocked", contentType: null, mimeValidation: "unsupported_extension", sizeValidation: "over_limit", contentHash: null });
  });
});
