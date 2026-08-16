import { parse as parseCsv } from "csv-parse/sync";
import * as yauzl from "yauzl";

export const NOTION_IMPORT_LIMITS = {
  maxOuterArchives: 100,
  maxEntries: 5_000,
  maxNestedDepth: 1,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxTextBytes: 4 * 1024 * 1024,
} as const;

export type NotionPropertyType = "text" | "number" | "date" | "checkbox" | "single_select" | "multi_select" | "url" | "person" | "files" | "created_time" | "last_edited_time" | "unsupported";
export type NotionCandidateKind = "database" | "task_database" | "meeting_database";

export type NotionProperty = { name: string; type: NotionPropertyType; nonEmptyCount: number; sampleValues: string[] };
export type NotionDatabase = { sourceId: string; sourcePath: string; name: string; candidateKind: NotionCandidateKind; rowCount: number; properties: NotionProperty[]; rows: Record<string, string>[]; relatedPageCount: number };
export type NotionPage = { sourceId: string; sourcePath: string; title: string; parentPath: string | null; contentHtml: string; internalLinkCount: number; databaseRowPage: boolean };
export type NotionAsset = { sourceId: string; sourcePath: string; extension: string; bytes: number };
export type NotionWarning = { code: "zip_path_rejected" | "zip_limit_exceeded" | "unsupported_file" | "csv_malformed" | "html_too_large" | "nested_zip_rejected" | "duplicate_source_id"; sourcePath: string; detail: string };
export type NotionExportModel = {
  pages: NotionPage[];
  databases: NotionDatabase[];
  assets: NotionAsset[];
  warnings: NotionWarning[];
  unsupportedFiles: number;
  sourceFiles: number;
  internalLinks: number;
  duplicateSourceIds: string[];
};

export type NotionDryRunSummary = {
  documents: number;
  databases: number;
  databaseRows: number;
  taskCandidates: number;
  meetingCandidates: number;
  assets: number;
  unsupportedFiles: number;
  warnings: number;
  internalLinks: number;
  duplicateSourceIds: number;
  readyToImport: number;
  needsReview: number;
};

type ParseState = { model: NotionExportModel; entryCount: number; totalBytes: number };

const textExtensions = new Set([".html", ".htm", ".csv"]);
const assetExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".docx", ".pptx", ".txt", ".json", ".py", ".zip"]);

export type NotionPersonCandidate = { name?: string; email?: string };
export type ProveItPersonCandidate = { employeeId: string; name?: string; email?: string };
export type NotionPersonMatch = { status: "matched"; employeeId: string } | { status: "unresolved" | "ambiguous" };

/** Only call this for a property already classified as a Notion Person field. */
export function splitNotionPersonValue(value: string) {
  const seen = new Set<string>();
  return value.split(/[;,\n]/).map((item) => item.trim()).filter((item) => {
    const key = normalizedIdentity(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isSafeNotionZipPath(value: string) {
  return Boolean(value) && !value.startsWith("/") && !value.startsWith("\\") && !/^[a-zA-Z]:[\\/]/.test(value) && !value.split(/[\\/]/).some((part) => part === ".." || part === "");
}

function extension(path: string) { const match = /\.[^.\/]+$/.exec(path); return match?.[0].toLowerCase() ?? ""; }
function sourceId(path: string) { const filename = basename(path); return filename.match(/(?:^|[^a-f0-9])([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:[^a-f0-9]|$)/i)?.[1]?.toLowerCase() ?? `path:${path.toLowerCase()}`; }
function basename(path: string) { return path.split("/").at(-1) ?? path; }
function titleFromPath(path: string) { return basename(path).replace(/\.[^.]+$/, "").replace(/(?:\s|_)(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i, "").trim() || "Untitled"; }
function decodeEntities(value: string) { return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
function isDirectory(path: string) { return path.endsWith("/"); }

async function bufferForEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number) {
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > limit) throw new Error("entry_limit");
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function warning(state: ParseState, code: NotionWarning["code"], sourcePath: string, detail: string) { state.model.warnings.push({ code, sourcePath, detail }); }

function propertyType(name: string, values: string[]): NotionPropertyType {
  const normalized = name.toLowerCase().trim();
  if (/attach|file|media|image|receipt|invoice|contract/.test(normalized)) return "files";
  if (/created (at|by|time)|submitted time/.test(normalized)) return "created_time";
  if (/last (edited|updated)|updated at/.test(normalized)) return "last_edited_time";
  if (/assignee|owner|attendee|reviewer|person|created by|edited by|manager|reports to|employee name|requested by|approved by|designed by/.test(normalized)) return "person";
  if (/url|link|website/.test(normalized) || values.some((value) => /^https?:\/\//i.test(value))) return "url";
  if (/date|due|start|end|month|expiry|time/.test(normalized)) return "date";
  if (/is done|checkbox|approval check|past due/.test(normalized) || (values.length > 0 && values.every((value) => /^(true|false|yes|no)$/i.test(value)))) return "checkbox";
  if (/amount|cost|credit|duration|effort|number|size/.test(normalized) || (values.length > 0 && values.every((value) => /^[-+]?\d+(?:\.\d+)?$/.test(value.replace(/,/g, ""))))) return "number";
  if (/multi|languages|traits|tags|skills|reviewers/.test(normalized)) return "multi_select";
  if (/status|priority|select|phase|category|type|role|team|department|platform|currency|cycle|frequency/.test(normalized)) return "single_select";
  return "text";
}

export function parseNotionCsv(content: string, sourcePath: string): NotionDatabase {
  const records = parseCsv(content, { bom: true, columns: true, skip_empty_lines: true, relax_column_count: true, trim: false }) as Record<string, unknown>[];
  const names = records.length ? Object.keys(records[0]) : (content.split(/\r?\n/, 1)[0] ?? "").replace(/^\uFEFF/, "").split(",").filter(Boolean);
  const rows = records.map((record) => Object.fromEntries(names.map((name) => [name, typeof record[name] === "string" ? record[name] : String(record[name] ?? "")] )));
  const properties = names.map((name) => {
    const values = rows.map((row) => row[name].trim()).filter(Boolean);
    return { name, type: propertyType(name, values), nonEmptyCount: values.length, sampleValues: values.slice(0, 3) };
  });
  const lower = names.map((name) => name.toLowerCase());
  const databaseTitle = titleFromPath(sourcePath).toLowerCase();
  const candidateKind: NotionCandidateKind = /(?:^|\s)tasks? tracker\b/.test(databaseTitle) ? "task_database" : /meeting/.test(databaseTitle) && lower.some((name) => /date|attendee/.test(name)) ? "meeting_database" : "database";
  return { sourceId: sourceId(sourcePath), sourcePath, name: titleFromPath(sourcePath), candidateKind, rowCount: rows.length, properties, rows, relatedPageCount: 0 };
}

function normalizedIdentity(value: string | undefined) { return value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") ?? ""; }

/** Matches only an unambiguous existing employee. Firebase UIDs are never part of this result. */
export function matchNotionPerson(person: NotionPersonCandidate, employees: ProveItPersonCandidate[]): NotionPersonMatch {
  const email = normalizedIdentity(person.email); const name = normalizedIdentity(person.name);
  // A single name token is not sufficient identity evidence for automatic matching.
  const hasFullName = name.split(" ").filter(Boolean).length >= 2;
  const matches = employees.filter((employee) => (email && normalizedIdentity(employee.email) === email) || (!email && hasFullName && normalizedIdentity(employee.name) === name));
  return matches.length === 1 ? { status: "matched", employeeId: matches[0].employeeId } : { status: matches.length > 1 ? "ambiguous" : "unresolved" };
}

function parseHtml(content: string, sourcePath: string): NotionPage {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content) ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(content);
  const links = [...content.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].filter((match) => !/^(?:https?:|mailto:|#)/i.test(match[1]));
  const parent = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : null;
  return { sourceId: sourceId(sourcePath), sourcePath, title: decodeEntities(titleMatch?.[1] ?? titleFromPath(sourcePath)), parentPath: parent, contentHtml: content, internalLinkCount: links.length, databaseRowPage: false };
}

async function walkZip(bytes: Buffer, archiveLabel: string, prefix: string, depth: number, state: ParseState): Promise<void> {
  if (depth > NOTION_IMPORT_LIMITS.maxNestedDepth) { warning(state, "nested_zip_rejected", prefix, "Nested ZIP depth exceeds the configured limit."); return; }
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(bytes, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true });
  } catch {
    warning(state, "zip_path_rejected", prefix || archiveLabel, "ZIP structure or entry path is unsafe.");
    return;
  }
  if (zip.entryCount > NOTION_IMPORT_LIMITS.maxEntries) { warning(state, "zip_limit_exceeded", prefix, "Archive has too many entries."); zip.close(); return; }
  try {
    for await (const entry of zip.eachEntry()) {
      if (isDirectory(entry.fileName)) continue;
      const sourcePath = prefix ? `${prefix}/${entry.fileName}` : entry.fileName;
      if (!isSafeNotionZipPath(entry.fileName)) { warning(state, "zip_path_rejected", sourcePath, "Unsafe ZIP entry path."); continue; }
      state.entryCount += 1; state.totalBytes += entry.uncompressedSize;
      if (state.entryCount > NOTION_IMPORT_LIMITS.maxEntries || state.totalBytes > NOTION_IMPORT_LIMITS.maxTotalBytes || entry.uncompressedSize > NOTION_IMPORT_LIMITS.maxEntryBytes) { warning(state, "zip_limit_exceeded", sourcePath, "ZIP safety limit exceeded."); continue; }
      const ext = extension(entry.fileName);
      if (ext === ".zip") {
        if (depth >= NOTION_IMPORT_LIMITS.maxNestedDepth) { state.model.assets.push({ sourceId: sourceId(sourcePath), sourcePath, extension: "zip", bytes: entry.uncompressedSize }); warning(state, "nested_zip_rejected", sourcePath, "Nested attachment ZIP is preserved but not parsed."); continue; }
        const nested = await bufferForEntry(zip, entry, NOTION_IMPORT_LIMITS.maxEntryBytes); await walkZip(nested, archiveLabel, sourcePath, depth + 1, state); continue;
      }
      state.model.sourceFiles += 1;
      if (!textExtensions.has(ext) && !assetExtensions.has(ext)) { state.model.unsupportedFiles += 1; warning(state, "unsupported_file", sourcePath, "File type is preserved as unsupported metadata only."); continue; }
      if (assetExtensions.has(ext)) { state.model.assets.push({ sourceId: sourceId(sourcePath), sourcePath, extension: ext.slice(1), bytes: entry.uncompressedSize }); continue; }
      if (entry.uncompressedSize > NOTION_IMPORT_LIMITS.maxTextBytes) { warning(state, "html_too_large", sourcePath, "Text entry exceeds the configured parse limit."); continue; }
      const content = (await bufferForEntry(zip, entry, NOTION_IMPORT_LIMITS.maxTextBytes)).toString("utf8");
      if (ext === ".csv") { try { state.model.databases.push(parseNotionCsv(content, sourcePath)); } catch { warning(state, "csv_malformed", sourcePath, "CSV could not be parsed safely."); } }
      else { const page = parseHtml(content, sourcePath); state.model.pages.push(page); state.model.internalLinks += page.internalLinkCount; }
    }
  } finally { zip.close(); }
}

export async function analyzeNotionExportArchives(archives: { name: string; bytes: Buffer }[]): Promise<NotionExportModel> {
  const state: ParseState = { entryCount: 0, totalBytes: 0, model: { pages: [], databases: [], assets: [], warnings: [], unsupportedFiles: 0, sourceFiles: 0, internalLinks: 0, duplicateSourceIds: [] } };
  if (archives.length > NOTION_IMPORT_LIMITS.maxOuterArchives) throw new Error("Too many Notion export archives.");
  for (const archive of archives) await walkZip(archive.bytes, archive.name, "", 0, state);
  const seen = new Set<string>();
  for (const item of [...state.model.pages, ...state.model.databases]) { if (seen.has(item.sourceId)) state.model.duplicateSourceIds.push(item.sourceId); else seen.add(item.sourceId); }
  for (const duplicate of state.model.duplicateSourceIds) warning(state, "duplicate_source_id", duplicate, "A repeated Notion source identifier requires preview review.");
  const databaseFolders = state.model.databases.map((database) => database.sourcePath.slice(0, database.sourcePath.lastIndexOf("/"))).filter(Boolean);
  state.model.pages.forEach((page) => { page.databaseRowPage = databaseFolders.some((folder) => page.sourcePath.startsWith(`${folder}/`)); });
  state.model.databases.forEach((database) => { const folder = database.sourcePath.slice(0, database.sourcePath.lastIndexOf("/")); database.relatedPageCount = state.model.pages.filter((page) => folder && page.sourcePath.startsWith(`${folder}/`)).length; });
  return state.model;
}

export function summarizeNotionDryRun(model: NotionExportModel): NotionDryRunSummary {
  const taskCandidates = model.databases.filter((database) => database.candidateKind === "task_database").reduce((sum, database) => sum + database.rowCount, 0);
  const meetingCandidates = model.databases.filter((database) => database.candidateKind === "meeting_database").reduce((sum, database) => sum + database.rowCount, 0);
  const needsReview = model.warnings.length + model.duplicateSourceIds.length + model.databases.filter((database) => database.properties.some((property) => property.type === "files" || property.type === "unsupported")).length;
  return { documents: model.pages.length, databases: model.databases.length, databaseRows: model.databases.reduce((sum, database) => sum + database.rowCount, 0), taskCandidates, meetingCandidates, assets: model.assets.length, unsupportedFiles: model.unsupportedFiles, warnings: model.warnings.length, internalLinks: model.internalLinks, duplicateSourceIds: model.duplicateSourceIds.length, readyToImport: needsReview ? 0 : model.pages.length + model.databases.length, needsReview };
}
