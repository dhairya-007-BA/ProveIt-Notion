import type { MigrationDocumentCategory, NotionMigrationManifest, NotionMigrationRecord } from "@/lib/notion-migration-preview";

export type MigrationWorkspaceChoice = "company" | "business" | "technology" | "board" | "skip";
export type MigrationStatusChoice = "todo" | "in_progress" | "review" | "done" | "blocked" | "raw" | "skip";
export type MigrationPropertyChoice = "native" | "custom" | "raw" | "skip";
export type MigrationDuplicateChoice = "use_record" | "skip_all" | "keep_separate" | "manual_review";
export type MigrationDocumentChoice = "approve_with_warning" | "keep_blocked";

export type MigrationResolution = {
  type: "workspace" | "person" | "duplicate" | "status" | "property" | "schema" | "document";
  key: string;
  value: Record<string, unknown>;
};

export type MigrationResolutionIndex = Record<string, MigrationResolution>;

export function resolutionKey(type: MigrationResolution["type"], key: string) {
  return `${type}:${key}`;
}

export function indexResolutions(values: MigrationResolution[]) {
  return Object.fromEntries(values.map((value) => [resolutionKey(value.type, value.key), value]));
}

function sourceDatabaseId(record: NotionMigrationRecord) {
  return record.sourceId.replace(/:row:\d+$/, "");
}

function workspaceResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  if (record.destinationWorkspaceId) return true;
  const decision = resolutions[resolutionKey("workspace", sourceDatabaseId(record))];
  return typeof decision?.value.workspaceId === "string" && decision.value.workspaceId !== "skip";
}

function personResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  // A persisted null intentionally means "deferred". It must not make a
  // record importable; it only leaves records using that source person blocked.
  return record.personMappings.every((person) => person.status === "matched" || typeof resolutions[resolutionKey("person", person.source)]?.value.employeeId === "string");
}

function documentResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  if (record.destinationEntityType !== "document") return true;
  if (!record.documentReview?.safeWithWarning) return false;
  return resolutions[resolutionKey("document", record.recordId)]?.value.choice === "approve_with_warning";
}

function duplicateResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  if (record.duplicateState === "unique") return true;
  const decision = resolutions[resolutionKey("duplicate", sourceDatabaseId(record))];
  return Boolean(decision && decision.value.choice !== "manual_review");
}

function schemaResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  if (record.destinationEntityType !== "database") return true;
  return resolutions[resolutionKey("schema", sourceDatabaseId(record))]?.value.approved === true;
}

function statusResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  if (record.destinationEntityType !== "task") return true;
  const status = record.normalizedProperties.status;
  if (status !== "Waiting on Documents/On Hold") return true;
  return Boolean(resolutions[resolutionKey("status", "Waiting on Documents/On Hold")]);
}

function propertiesResolved(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex) {
  if (record.sourceKind !== "database" && record.sourceKind !== "database_row") return true;
  if (record.destinationEntityType === "employee_directory") return true;
  const properties = record.sourceKind === "database" && Array.isArray(record.normalizedProperties.properties)
    ? record.normalizedProperties.properties
    : [];
  if (record.sourceKind === "database_row") return true;
  return properties.every((property) => {
    if (typeof property !== "object" || property === null || typeof (property as { name?: unknown }).name !== "string") return false;
    return Boolean(resolutions[resolutionKey("property", `${sourceDatabaseId(record)}:${(property as { name: string }).name}`)]);
  });
}

export function migrationRecordReadiness(record: NotionMigrationRecord, resolutions: MigrationResolutionIndex): "ready" | "needs_review" | "blocked" | "skipped" {
  if (record.state === "skipped") return "skipped";
  if (record.state === "unsupported" || record.destinationEntityType === "unsupported") return "blocked";
  if (record.destinationEntityType === "asset") return "blocked";
  if (record.destinationEntityType === "document" && record.documentReview && !record.documentReview.safeWithWarning) return "blocked";
  if (!workspaceResolved(record, resolutions) || !personResolved(record, resolutions) || !duplicateResolved(record, resolutions) || !schemaResolved(record, resolutions) || !statusResolved(record, resolutions) || !propertiesResolved(record, resolutions) || !documentResolved(record, resolutions)) return "needs_review";
  return "ready";
}

export function migrationReadiness(manifest: NotionMigrationManifest, values: MigrationResolution[]) {
  const resolutions = indexResolutions(values);
  const databasePropertiesReady = new Map(manifest.records.filter((record) => record.sourceKind === "database").map((record) => [sourceDatabaseId(record), propertiesResolved(record, resolutions)]));
  const records = manifest.records.map((record) => {
    const readiness = migrationRecordReadiness(record, resolutions);
    const sourcePropertiesReady = databasePropertiesReady.get(sourceDatabaseId(record));
    return { ...record, readiness: readiness === "ready" && sourcePropertiesReady === false ? "needs_review" as const : readiness };
  });
  const unresolvedPropertySchemas = [...databasePropertiesReady.values()].some((value) => value === false);
  const totals = { ready: 0, needs_review: 0, blocked: 0, skipped: 0 };
  records.forEach((record) => { totals[record.readiness] += 1; });
  return { records, totals, importLocked: unresolvedPropertySchemas || totals.needs_review > 0 || totals.blocked > 0 };
}

/** Canonical dashboard facts; all migration summary surfaces must consume this. */
export function migrationReviewSummary(manifest: NotionMigrationManifest, values: MigrationResolution[]) {
  const resolutions = indexResolutions(values);
  const sourceDatabases = [...new Map(manifest.records.filter((record) => record.sourceKind === "database").map((record) => [record.sourceId, record])).values()];
  const people = [...new Map(manifest.records.flatMap((record) => record.personMappings).map((person) => [person.source.trim().toLowerCase(), person])).values()];
  const workspaceResolvedCount = sourceDatabases.filter((record) => workspaceResolved(record, resolutions)).length;
  const personStates = people.reduce((counts, person) => {
    const manual = resolutions[resolutionKey("person", person.source)];
    if (person.status === "matched") counts.matched += 1;
    else if (manual && manual.value.employeeId !== null) counts.manual += 1;
    else if (person.status === "ambiguous") counts.ambiguous += 1;
    else counts.deferred += 1;
    return counts;
  }, { matched: 0, manual: 0, deferred: 0, ambiguous: 0 });
  const duplicateResolvedCount = manifest.duplicateSets.filter((set) => Boolean(resolutions[resolutionKey("duplicate", set.sourceId)])).length;
  const statusResolvedCount = manifest.records.some((record) => record.destinationEntityType === "task" && record.normalizedProperties.status === "Waiting on Documents/On Hold") ? (resolutions[resolutionKey("status", "Waiting on Documents/On Hold")] ? 1 : 0) : 0;
  const sourceProperties = sourceDatabases.flatMap((record) => Array.isArray(record.normalizedProperties.properties) ? record.normalizedProperties.properties.map((property) => `${record.sourceId}:${String((property as { name?: unknown }).name ?? "property")}`) : []);
  const propertiesResolvedCount = sourceProperties.filter((key) => Boolean(resolutions[resolutionKey("property", key)])).length;
  const genericDatabases = sourceDatabases.filter((record) => record.destinationEntityType === "database");
  const schemasApprovedCount = genericDatabases.filter((record) => resolutions[resolutionKey("schema", record.sourceId)]?.value.approved === true).length;
  const documents = manifest.records.filter((record) => record.destinationEntityType === "document" && record.state !== "skipped");
  const documentsSafeWithWarning = documents.filter((record) => record.documentReview?.safeWithWarning).length;
  const documentsApprovedWithWarning = documents.filter((record) => resolutions[resolutionKey("document", record.recordId)]?.value.choice === "approve_with_warning").length;
  const documentCategories = documents.reduce<Record<MigrationDocumentCategory, number>>((counts, record) => {
    record.documentReview?.categories.forEach((category) => { counts[category] += 1; });
    return counts;
  }, { representable_rich_text: 0, unresolved_internal_links: 0, asset_dependency: 0, embedded_database: 0, unsupported_rich_block: 0, source_parse_warning: 0 });
  return {
    workspaces: { total: sourceDatabases.length, resolved: workspaceResolvedCount, remaining: sourceDatabases.length - workspaceResolvedCount },
    people: { total: people.length, ...personStates },
    duplicates: { total: manifest.duplicateSets.length, resolved: duplicateResolvedCount, remaining: manifest.duplicateSets.length - duplicateResolvedCount },
    statuses: { total: manifest.records.some((record) => record.destinationEntityType === "task" && record.normalizedProperties.status === "Waiting on Documents/On Hold") ? 1 : 0, resolved: statusResolvedCount },
    properties: { total: sourceProperties.length, resolved: propertiesResolvedCount, remaining: sourceProperties.length - propertiesResolvedCount },
    schemas: { total: genericDatabases.length, approved: schemasApprovedCount, remaining: genericDatabases.length - schemasApprovedCount },
    documents: { total: documents.length, safeWithWarning: documentsSafeWithWarning, approvedWithWarning: documentsApprovedWithWarning, blocked: documents.length - documentsSafeWithWarning, remaining: documents.length - documentsApprovedWithWarning, categories: documentCategories },
  };
}

export function validateMigrationResolution(input: unknown): MigrationResolution | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const value = input as { type?: unknown; key?: unknown; value?: unknown };
  if (typeof value.key !== "string" || !value.key.trim() || value.key.length > 500 || typeof value.value !== "object" || value.value === null || Array.isArray(value.value)) return null;
  const type = value.type; const data = value.value as Record<string, unknown>;
  if (type === "workspace" && typeof data.workspaceId === "string" && (["company", "business", "technology", "board", "skip"] as string[]).includes(data.workspaceId)) return { type, key: value.key, value: { workspaceId: data.workspaceId } };
  if (type === "person" && (typeof data.employeeId === "string" || data.employeeId === null)) return { type, key: value.key, value: { employeeId: data.employeeId } };
  if (type === "duplicate" && typeof data.choice === "string" && (["use_record", "skip_all", "keep_separate", "manual_review"] as string[]).includes(data.choice) && (data.recordId === undefined || typeof data.recordId === "string")) return { type, key: value.key, value: { choice: data.choice, ...(typeof data.recordId === "string" ? { recordId: data.recordId } : {}) } };
  if (type === "status" && typeof data.choice === "string" && (["todo", "in_progress", "review", "done", "blocked", "raw", "skip"] as string[]).includes(data.choice)) return { type, key: value.key, value: { choice: data.choice } };
  if (type === "property" && typeof data.choice === "string" && (["native", "custom", "raw", "skip"] as string[]).includes(data.choice) && (data.choice !== "skip" || data.confirmSkip === true)) return { type, key: value.key, value: { choice: data.choice, ...(data.confirmSkip === true ? { confirmSkip: true } : {}) } };
  if (type === "schema" && typeof data.approved === "boolean") return { type, key: value.key, value: { approved: data.approved } };
  if (type === "document" && typeof data.choice === "string" && (["approve_with_warning", "keep_blocked"] as string[]).includes(data.choice)) return { type, key: value.key, value: { choice: data.choice } };
  return null;
}
