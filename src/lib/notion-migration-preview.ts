import { createHash } from "node:crypto";

import {
  analyzeNotionExportArchives,
  matchNotionPerson,
  splitNotionPersonValue,
  type NotionDatabase,
  type NotionExportModel,
  type NotionPersonMatch,
  type NotionProperty,
  type NotionPropertyType,
  type ProveItPersonCandidate,
} from "@/lib/notion-import";
import { planNotionAssetMigration, type NotionAssetMigrationPlan } from "@/lib/notion-migration-assets";

export type MigrationWorkspaceId = "business" | "technology" | "company" | "board";
export type MigrationEntityType = "task" | "meeting" | "document" | "database" | "employee_directory" | "asset" | "unsupported";
export type MigrationRecordState = "ready" | "needs_review" | "duplicate" | "unsupported" | "skipped";

export type MigrationPersonMapping = {
  property: string;
  source: string;
  status: NotionPersonMatch["status"];
  employeeId?: string;
  employeeName?: string;
  employeeEmail?: string;
  matchingReason?: "exact_work_email" | "unique_full_name";
  occurrenceId: string;
};

export type NotionMigrationDuplicateSet = {
  sourceId: string;
  classification: "conflicting" | "export_structure";
  candidates: { recordId: string; sourcePath: string; sourceKind: "database" | "page"; name: string; destinationEntityType: MigrationEntityType }[];
  differences: string[];
};

export type MigrationAssetPlan = NotionAssetMigrationPlan;

export type MigrationDocumentCategory =
  | "representable_rich_text"
  | "unresolved_internal_links"
  | "asset_dependency"
  | "embedded_database"
  | "unsupported_rich_block"
  | "source_parse_warning";

export type MigrationDocumentReview = {
  categories: MigrationDocumentCategory[];
  representableText: string;
  rawContentFingerprint: string;
  safeWithWarning: boolean;
};

export type NotionMigrationRecord = {
  recordId: string;
  sourceId: string;
  sourcePath: string;
  sourceKind: "database" | "database_row" | "page" | "asset";
  destinationWorkspaceId: MigrationWorkspaceId | null;
  workspaceConfidence: "high" | "manual";
  workspaceReason: string;
  destinationEntityType: MigrationEntityType;
  normalizedProperties: Record<string, unknown>;
  rawSource: Record<string, string> | null;
  personMappings: MigrationPersonMapping[];
  duplicateState: "unique" | "duplicate_source" | "duplicate_record";
  internalLinkDependencies: { state: "pending"; count: number };
  assets: MigrationAssetPlan[];
  documentReview?: MigrationDocumentReview;
  warnings: string[];
  state: MigrationRecordState;
  safeToImport: boolean;
};

export type NotionMigrationManifest = {
  version: 1;
  batchId: string;
  generatedAt: string;
  dryRun: true;
  sourceFingerprint: string;
  sourceInventory: { archiveCount: number; pages: number; databases: number; databaseRows: number; assets: number };
  totals: Record<MigrationRecordState, number>;
  records: NotionMigrationRecord[];
  duplicateSets: NotionMigrationDuplicateSet[];
  warnings: { code: string; sourcePath: string }[];
  importDesign: {
    idempotencyKey: "notion:v1:<sourceFingerprint>:<sourceId>";
    conflictPolicy: "never_merge_conflicting_records";
    importedTaskKaneoSync: "disabled";
  };
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

function titleProperty(properties: NotionProperty[]) {
  return properties.find((property) => /^(name|title|task|task name|meeting|subject)$/i.test(property.name))?.name ?? properties[0]?.name;
}

function destinationWorkspace(sourcePath: string): MigrationWorkspaceId | null {
  const value = sourcePath.toLowerCase();
  if (/(^|[\\/ _-])business([\\/ _-]|$)/.test(value)) return "business";
  if (/(proveit tech team|(^|[\\/ _-])technology([\\/ _-]|$))/.test(value)) return "technology";
  if (/(^|[\\/ _-])company([\\/ _-]|$)/.test(value)) return "company";
  if (/(board of directors|\bbod\b|(^|[\\/ _-])board([\\/ _-]|$))/.test(value)) return "board";
  return null;
}

function workspaceDecision(sourcePath: string) {
  const workspaceId = destinationWorkspace(sourcePath);
  return {
    workspaceId,
    workspaceConfidence: workspaceId ? "high" as const : "manual" as const,
    workspaceReason: workspaceId ? "Recognized workspace source path" : "No deterministic workspace source path was found",
  };
}

function isEmployeeDirectory(database: NotionDatabase) {
  return /(?:employee|people|staff|team|directory)/i.test(`${database.name} ${database.sourcePath}`);
}

function databaseEntityType(database: NotionDatabase): MigrationEntityType {
  // Employee directory exports are historical data sources, not new ProveIt
  // employees. They remain database rows and never trigger employee creation.
  if (isEmployeeDirectory(database)) return "database";
  if (database.candidateKind === "task_database") return "task";
  if (database.candidateKind === "meeting_database") return "meeting";
  return "database";
}

function normalizePerson(value: string) {
  const trimmed = value.trim();
  const email = /<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i.exec(trimmed)?.[1];
  return email ? { email, name: trimmed.replace(/<[^>]+>/g, "").trim() || undefined } : { name: trimmed || undefined };
}

function mappedProperties(properties: NotionProperty[], row: Record<string, string>, people: ProveItPersonCandidate[]) {
  const normalized: Record<string, unknown> = {};
  const personMappings: MigrationPersonMapping[] = [];
  for (const property of properties) {
    const value = row[property.name]?.trim() ?? "";
    if (!value) continue;
    const key = normalizedKey(property.name);
    if (property.type === "person") {
      const identities = splitNotionPersonValue(value);
      const resolvedEmployeeIds: string[] = [];
      const deferred: string[] = [];
      identities.forEach((source, index) => {
        const personIdentity = normalizePerson(source);
        const match = matchNotionPerson(personIdentity, people);
        const employee = "employeeId" in match ? people.find((candidate) => candidate.employeeId === match.employeeId) : undefined;
        personMappings.push({ property: property.name, source, status: match.status, occurrenceId: `${property.name}:${index}`, ...("employeeId" in match ? { employeeId: match.employeeId, employeeName: employee?.name, employeeEmail: employee?.email, matchingReason: personIdentity.email ? "exact_work_email" as const : "unique_full_name" as const } : {}) });
        if ("employeeId" in match) resolvedEmployeeIds.push(match.employeeId); else deferred.push(source);
      });
      normalized[key] = { employeeIds: resolvedEmployeeIds, deferredPeople: deferred };
      continue;
    }
    if (property.type === "number") normalized[key] = Number(value.replace(/,/g, ""));
    else if (property.type === "checkbox") normalized[key] = /^(true|yes|1)$/i.test(value);
    else if (property.type === "multi_select") normalized[key] = value.split(/[;|]/).map((item) => item.trim()).filter(Boolean);
    else normalized[key] = value;
  }
  return { normalized, personMappings };
}

function stateFor({ workspaceId, entityType, duplicateState, personMappings, warnings }: {
  workspaceId: MigrationWorkspaceId | null;
  entityType: MigrationEntityType;
  duplicateState: NotionMigrationRecord["duplicateState"];
  personMappings: MigrationPersonMapping[];
  warnings: string[];
}): MigrationRecordState {
  if (entityType === "unsupported") return "unsupported";
  if (duplicateState !== "unique") return "duplicate";
  if (entityType === "employee_directory") return "needs_review";
  if (!workspaceId || personMappings.some((mapping) => mapping.status !== "matched") || warnings.length > 0) return "needs_review";
  return "ready";
}

function sourceWarnings(model: NotionExportModel, sourcePath: string) {
  return model.warnings.filter((warning) => warning.sourcePath === sourcePath).map((warning) => warning.code);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Produces the only document representation ProveIt's plain-text editor can
 * promise today. The original HTML stays in the manifest as traceable source
 * material; this function never attempts to render or execute it.
 */
function representableDocumentText(contentHtml: string) {
  return decodeHtmlEntities(
    contentHtml
      .replace(/<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "")
      .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|pre|br)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  ).replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
}

export function reviewNotionDocument(page: NotionExportModel["pages"][number], warnings: string[]): MigrationDocumentReview {
  const categories = new Set<MigrationDocumentCategory>();
  const html = page.contentHtml;
  if (/<[^>]+>/.test(html)) categories.add("representable_rich_text");
  if (page.internalLinkCount > 0) categories.add("unresolved_internal_links");
  if (/<(?:img|video|audio|object|embed)\b/i.test(html) || /\b(?:src|href)\s*=\s*["'][^"']+\.(?:png|jpe?g|gif|webp|svg|pdf|docx|pptx|zip)(?:[?#][^"']*)?["']/i.test(html)) categories.add("asset_dependency");
  if (/<(?:table|thead|tbody|tfoot|tr|td|th)\b/i.test(html)) categories.add("embedded_database");
  if (/<(?:iframe|canvas|form|input|select|textarea|math)\b/i.test(html)) categories.add("unsupported_rich_block");
  if (warnings.length > 0) categories.add("source_parse_warning");
  const blocking = ["asset_dependency", "embedded_database", "unsupported_rich_block", "source_parse_warning"] as const;
  return {
    categories: [...categories],
    representableText: representableDocumentText(html),
    rawContentFingerprint: digest(html),
    safeWithWarning: !blocking.some((category) => categories.has(category)),
  };
}

function duplicateState(sourceId: string, recordSignature: string, sourceIds: Map<string, number>, records: Map<string, number>): NotionMigrationRecord["duplicateState"] {
  if ((sourceIds.get(sourceId) ?? 0) > 1) return "duplicate_source";
  return (records.get(recordSignature) ?? 0) > 1 ? "duplicate_record" : "unique";
}

function recordId(sourceId: string, discriminator: string) {
  return `notion:${digest(`${sourceId}:${discriminator}`).slice(0, 32)}`;
}

function createDatabaseRecords(model: NotionExportModel, employees: ProveItPersonCandidate[], sourceIds: Map<string, number>) {
  const recordSignatures = new Map<string, number>();
  for (const database of model.databases) for (const row of database.rows) {
    const signature = `${database.sourceId}:${JSON.stringify(row)}`;
    recordSignatures.set(signature, (recordSignatures.get(signature) ?? 0) + 1);
  }
  const records: NotionMigrationRecord[] = [];
  for (const database of model.databases) {
    const workspace = workspaceDecision(database.sourcePath);
    const workspaceId = workspace.workspaceId;
    const entityType = databaseEntityType(database);
    const databaseWarnings = sourceWarnings(model, database.sourcePath);
    records.push({
      recordId: recordId(database.sourceId, `database:${database.sourcePath}`), sourceId: database.sourceId, sourcePath: database.sourcePath,
      sourceKind: "database", destinationWorkspaceId: workspaceId, workspaceConfidence: workspace.workspaceConfidence, workspaceReason: workspace.workspaceReason, destinationEntityType: entityType,
      normalizedProperties: { name: database.name, candidateKind: database.candidateKind, rowCount: database.rowCount, properties: database.properties.map((property) => ({ name: property.name, type: property.type, nonEmptyCount: property.nonEmptyCount, sampleValues: property.sampleValues })) }, rawSource: null,
      personMappings: [], duplicateState: duplicateState(database.sourceId, database.sourceId, sourceIds, new Map()), internalLinkDependencies: { state: "pending", count: database.relatedPageCount }, assets: [], warnings: databaseWarnings,
      state: stateFor({ workspaceId, entityType, duplicateState: duplicateState(database.sourceId, database.sourceId, sourceIds, new Map()), personMappings: [], warnings: databaseWarnings }), safeToImport: false,
    });
    database.rows.forEach((row, index) => {
      const rowSignature = `${database.sourceId}:${JSON.stringify(row)}`;
      const duplicate = duplicateState(database.sourceId, rowSignature, sourceIds, recordSignatures);
      const mapped = mappedProperties(database.properties, row, employees);
      const title = titleProperty(database.properties);
      const normalizedProperties = { ...mapped.normalized, ...(title && row[title] ? { title: row[title].trim() } : {}) };
      const warnings: string[] = [...databaseWarnings];
      if (database.properties.some((property) => property.type === "unsupported")) warnings.push("unsupported_property_type");
      const state = stateFor({ workspaceId, entityType, duplicateState: duplicate, personMappings: mapped.personMappings, warnings });
      records.push({ recordId: recordId(database.sourceId, `row:${database.sourcePath}:${index}:${digest(JSON.stringify(row))}`), sourceId: `${database.sourceId}:row:${index}`, sourcePath: database.sourcePath, sourceKind: "database_row", destinationWorkspaceId: workspaceId, workspaceConfidence: workspace.workspaceConfidence, workspaceReason: workspace.workspaceReason, destinationEntityType: entityType, normalizedProperties, rawSource: row, personMappings: mapped.personMappings, duplicateState: duplicate, internalLinkDependencies: { state: "pending", count: 0 }, assets: [], warnings, state, safeToImport: state === "ready" });
    });
  }
  return records;
}

function duplicateSets(model: NotionExportModel, records: NotionMigrationRecord[]): NotionMigrationDuplicateSet[] {
  const sources = [...model.pages.map((page) => ({ sourceId: page.sourceId, sourcePath: page.sourcePath, sourceKind: "page" as const, name: page.title, titleSignature: page.title, contentSignature: page.contentHtml, schemaSignature: "", rowSignature: "", signature: `${page.title}:${page.contentHtml}` })), ...model.databases.map((database) => ({ sourceId: database.sourceId, sourcePath: database.sourcePath, sourceKind: "database" as const, name: database.name, titleSignature: database.name, contentSignature: "", schemaSignature: JSON.stringify(database.properties), rowSignature: JSON.stringify(database.rows), signature: JSON.stringify({ properties: database.properties, rows: database.rows }) }))];
  return [...new Map(sources.filter((source) => sources.filter((candidate) => candidate.sourceId === source.sourceId).length > 1).map((source) => [source.sourceId, source])).values()].map((source) => {
    const candidates = sources.filter((candidate) => candidate.sourceId === source.sourceId);
    const signatures = new Set(candidates.map((candidate) => candidate.signature));
    const types = new Set(candidates.map((candidate) => candidate.sourceKind));
    const differences: string[] = [];
    if (types.size > 1) differences.push("source type");
    if (new Set(candidates.map((candidate) => candidate.titleSignature)).size > 1) differences.push("title/name");
    if (new Set(candidates.map((candidate) => candidate.contentSignature)).size > 1) differences.push("document content");
    if (new Set(candidates.map((candidate) => candidate.schemaSignature)).size > 1) differences.push("database schema");
    if (new Set(candidates.map((candidate) => candidate.rowSignature)).size > 1) differences.push("database rows/properties");
    const classification = signatures.size === 1 ? "export_structure" as const : "conflicting" as const;
    return { sourceId: source.sourceId, classification, differences: differences.length ? differences : ["duplicate export structure"], candidates: candidates.map((candidate) => {
      const record = records.find((item) => item.sourceId === candidate.sourceId && item.sourcePath === candidate.sourcePath && item.sourceKind === candidate.sourceKind);
      return { recordId: record?.recordId ?? recordId(candidate.sourceId, `${candidate.sourceKind}:${candidate.sourcePath}`), sourcePath: candidate.sourcePath, sourceKind: candidate.sourceKind, name: candidate.name, destinationEntityType: record?.destinationEntityType ?? "unsupported" };
    }) };
  });
}

export function buildNotionMigrationManifest(model: NotionExportModel, employees: ProveItPersonCandidate[], sourceFingerprint: string, archiveCount = 0): NotionMigrationManifest {
  const sourceIds = new Map<string, number>();
  for (const item of [...model.pages, ...model.databases, ...model.assets]) sourceIds.set(item.sourceId, (sourceIds.get(item.sourceId) ?? 0) + 1);
  const records = createDatabaseRecords(model, employees, sourceIds);
  for (const page of model.pages) {
    const workspace = workspaceDecision(page.sourcePath); const workspaceId = workspace.workspaceId; const duplicate = duplicateState(page.sourceId, page.sourceId, sourceIds, new Map()); const warnings = sourceWarnings(model, page.sourcePath);
    const documentReview = reviewNotionDocument(page, warnings);
    const state: MigrationRecordState = page.databaseRowPage ? "skipped" : stateFor({ workspaceId, entityType: "document", duplicateState: duplicate, personMappings: [], warnings: documentReview.safeWithWarning ? [] : warnings });
    records.push({ recordId: recordId(page.sourceId, `page:${page.sourcePath}`), sourceId: page.sourceId, sourcePath: page.sourcePath, sourceKind: "page", destinationWorkspaceId: workspaceId, workspaceConfidence: workspace.workspaceConfidence, workspaceReason: workspace.workspaceReason, destinationEntityType: "document", normalizedProperties: { title: page.title, contentHtml: page.contentHtml }, rawSource: null, personMappings: [], duplicateState: duplicate, internalLinkDependencies: { state: "pending", count: page.internalLinkCount }, assets: [], documentReview, warnings, state, safeToImport: false });
  }
  for (const asset of model.assets) {
    const workspace = workspaceDecision(asset.sourcePath); const workspaceId = workspace.workspaceId; const duplicate = duplicateState(asset.sourceId, asset.sourceId, sourceIds, new Map()); const state = duplicate === "unique" ? "needs_review" : "duplicate";
    records.push({ recordId: recordId(asset.sourceId, `asset:${asset.sourcePath}`), sourceId: asset.sourceId, sourcePath: asset.sourcePath, sourceKind: "asset", destinationWorkspaceId: workspaceId, workspaceConfidence: workspace.workspaceConfidence, workspaceReason: workspace.workspaceReason, destinationEntityType: "asset", normalizedProperties: {}, rawSource: null, personMappings: [], duplicateState: duplicate, internalLinkDependencies: { state: "pending", count: 0 }, assets: [planNotionAssetMigration({ sourceFingerprint, sourceId: asset.sourceId, sourcePath: asset.sourcePath, extension: asset.extension, bytes: asset.bytes })], warnings: ["asset_transfer_not_started"], state, safeToImport: false });
  }
  const totals: Record<MigrationRecordState, number> = { ready: 0, needs_review: 0, duplicate: 0, unsupported: 0, skipped: 0 };
  records.forEach((record) => { totals[record.state] += 1; });
  return { version: 1, batchId: `notion-preview-v1-${sourceFingerprint.slice(0, 20)}`, generatedAt: new Date().toISOString(), dryRun: true, sourceFingerprint, sourceInventory: { archiveCount, pages: model.pages.length, databases: model.databases.length, databaseRows: model.databases.reduce((total, database) => total + database.rowCount, 0), assets: model.assets.length }, totals, records, duplicateSets: duplicateSets(model, records), warnings: model.warnings.map((warning) => ({ code: warning.code, sourcePath: warning.sourcePath })), importDesign: { idempotencyKey: "notion:v1:<sourceFingerprint>:<sourceId>", conflictPolicy: "never_merge_conflicting_records", importedTaskKaneoSync: "disabled" } };
}

export async function createNotionMigrationPreview(archives: { name: string; bytes: Buffer }[], employees: ProveItPersonCandidate[]) {
  const sourceHash = createHash("sha256");
  [...archives].sort((left, right) => left.name.localeCompare(right.name)).forEach((archive) => {
    sourceHash.update(archive.name); sourceHash.update("\0"); sourceHash.update(archive.bytes); sourceHash.update("\0");
  });
  const sourceFingerprint = sourceHash.digest("hex");
  const model = await analyzeNotionExportArchives(archives);
  return buildNotionMigrationManifest(model, employees, sourceFingerprint, archives.length);
}

export const NOTION_MIGRATION_PROPERTY_TYPES: readonly NotionPropertyType[] = ["text", "number", "date", "checkbox", "single_select", "multi_select", "url", "person", "files", "created_time", "last_edited_time", "unsupported"];
