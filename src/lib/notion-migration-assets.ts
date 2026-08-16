import "server-only";

import { createHash } from "node:crypto";

export const NOTION_MIGRATION_ASSET_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  allowedContentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "application/json"] as const,
} as const;

export type NotionAssetMigrationPlan = {
  sourceFingerprint: string;
  sourceId: string;
  sourcePath: string;
  safeFileName: string;
  contentType: string | null;
  bytes: number;
  sourceAssetFingerprint: string;
  contentHash: null;
  contentHashAlgorithm: "sha256";
  destinationPathTemplate: string;
  duplicateKey: string;
  duplicateDetection: "source_identity_before_read_then_content_sha256";
  mimeValidation: "extension_checked_content_bytes_pending" | "unsupported_extension";
  sizeValidation: "within_limit" | "invalid_size" | "over_limit";
  state: "planned" | "blocked" | "uploaded" | "failed";
  provenance: "notion_export";
  uploadMode: "server_authorized_only";
  attachmentMapping: "pending_entity_resolution";
  attachmentOrder: "destination_entity_must_exist_before_attachment";
  retryPolicy: "no_automatic_retry_operator_reconciliation_required";
  orphanPrevention: "no_attachment_before_upload_and_entity_confirmation";
  failureState: "blocked_until_executor_is_explicitly_authorized";
};

const contentTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain", json: "application/json" };

function safeFileName(path: string, sourceId: string) {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "bin";
  return `${createHash("sha256").update(path).digest("hex").slice(0, 20)}-${sourceId.replace(/[^a-z0-9]/gi, "").slice(0, 20)}.${extension}`;
}

/** Planning only: no Storage client is imported and no upload can occur from this module. */
export function planNotionAssetMigration(input: { sourceFingerprint: string; sourceId: string; sourcePath: string; extension: string; bytes: number }): NotionAssetMigrationPlan {
  const contentType = contentTypes[input.extension.toLowerCase()] ?? null;
  const name = safeFileName(input.sourcePath, input.sourceId);
  const sourceAssetFingerprint = createHash("sha256").update(`${input.sourceFingerprint}\0${input.sourceId}\0${input.sourcePath}`).digest("hex");
  const sizeValidation = input.bytes <= 0 ? "invalid_size" as const : input.bytes > NOTION_MIGRATION_ASSET_LIMITS.maxBytes ? "over_limit" as const : "within_limit" as const;
  return {
    sourceFingerprint: input.sourceFingerprint,
    sourceId: input.sourceId,
    sourcePath: input.sourcePath,
    safeFileName: name,
    contentType,
    bytes: input.bytes,
    sourceAssetFingerprint,
    // The parser deliberately does not retain asset bytes. A future explicitly
    // authorized executor must calculate this from the reopened source entry
    // before any upload or duplicate decision.
    contentHash: null,
    contentHashAlgorithm: "sha256",
    destinationPathTemplate: `notion-migration/${input.sourceFingerprint}/assets/${sourceAssetFingerprint}/{sha256}/${name}`,
    duplicateKey: sourceAssetFingerprint,
    duplicateDetection: "source_identity_before_read_then_content_sha256",
    mimeValidation: contentType ? "extension_checked_content_bytes_pending" : "unsupported_extension",
    sizeValidation,
    state: "blocked",
    provenance: "notion_export",
    uploadMode: "server_authorized_only",
    attachmentMapping: "pending_entity_resolution",
    attachmentOrder: "destination_entity_must_exist_before_attachment",
    retryPolicy: "no_automatic_retry_operator_reconciliation_required",
    orphanPrevention: "no_attachment_before_upload_and_entity_confirmation",
    failureState: "blocked_until_executor_is_explicitly_authorized",
  };
}
