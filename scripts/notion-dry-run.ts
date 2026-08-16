import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { analyzeNotionExportArchives, summarizeNotionDryRun } from "../src/lib/notion-import";

async function main() {
  const exportDirectory = path.resolve(process.argv[2] ?? "Notion Exports");
  const entries = (await readdir(exportDirectory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip")).sort((left, right) => left.name.localeCompare(right.name));
  const model = await analyzeNotionExportArchives(await Promise.all(entries.map(async (entry) => ({ name: entry.name, bytes: await readFile(path.join(exportDirectory, entry.name)) }))));
  const summary = summarizeNotionDryRun(model);
  console.log(JSON.stringify({ mode: "dry_run", firestoreWrites: 0, kaneoCalls: 0, archives: entries.length, summary, databaseSchemas: model.databases.map((database) => ({ name: database.name, rows: database.rowCount, candidateKind: database.candidateKind, properties: database.properties.map((property) => ({ name: property.name, type: property.type, nonEmptyCount: property.nonEmptyCount })), relatedPageCount: database.relatedPageCount })), warnings: model.warnings.map((item) => ({ code: item.code, sourcePath: item.sourcePath })), }, null, 2));
}

void main();
