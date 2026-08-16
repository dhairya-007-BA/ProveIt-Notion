import { describe, expect, it } from "vitest";
import { analyzeNotionExportArchives, isSafeNotionZipPath, matchNotionPerson, parseNotionCsv, splitNotionPersonValue, summarizeNotionDryRun } from "@/lib/notion-import";

function storedZip(entries: { name: string; data: Buffer | string }[]) {
  const local: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0, 6); header.writeUInt16LE(0, 8); header.writeUInt32LE(0, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0, 8); directory.writeUInt16LE(0, 10); directory.writeUInt32LE(0, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name); offset += header.length + name.length + data.length;
  }
  const body = Buffer.concat(local); const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}

describe("Notion export parser", () => {
  it("rejects traversal and absolute ZIP paths", () => {
    expect(isSafeNotionZipPath("Private & Shared/Page.html")).toBe(true);
    expect(isSafeNotionZipPath("../outside.html")).toBe(false);
    expect(isSafeNotionZipPath("/outside.html")).toBe(false);
    expect(isSafeNotionZipPath("C:\\outside.html")).toBe(false);
  });

  it("parses the real nested ExportBlock pattern without a Firestore dependency", async () => {
    const inner = storedZip([
      { name: "Private & Shared/Plan 35b4e1e1942580123456789abcdef012.html", data: "<html><title>Plan</title><a href='Related.html'>Related</a></html>" },
      { name: "Private & Shared/Tasks 35b4e1e1942580fedcba987654321098.csv", data: "Task name,Assignee,Due date,Is Done\nShip import,Nadia,2026-08-16,false\n" },
    ]);
    const model = await analyzeNotionExportArchives([{ name: "outer.zip", bytes: storedZip([{ name: "ExportBlock-Part-1.zip", data: inner }]) }]);
    expect(model.pages).toHaveLength(1);
    expect(model.databases).toHaveLength(1);
    expect(model.databases[0]).toMatchObject({ candidateKind: "database", rowCount: 1 });
    expect(model.internalLinks).toBe(1);
    expect(summarizeNotionDryRun(model).databaseRows).toBe(1);
  });

  it("retains inferred property types and raw CSV rows for later server-side mapping", () => {
    const database = parseNotionCsv("Task name,Assignee,Due date,Is Done,Priority,Link,Amount\nShip,Nadia,2026-08-16,false,High,https://proveit.test,12\n", "Business Task Tracker abcdefabcdefabcdefabcdefabcdefab.csv");
    expect(database.rows).toHaveLength(1);
    expect(Object.fromEntries(database.properties.map((property) => [property.name, property.type]))).toMatchObject({ Assignee: "person", "Due date": "date", "Is Done": "checkbox", Priority: "single_select", Link: "url", Amount: "number" });
  });

  it("maps people only when an existing employee match is unique", () => {
    const employees = [{ employeeId: "P-001", name: "Nadia Patel", email: "nadia@proveit.test" }, { employeeId: "P-002", name: "Nadia Patel", email: "nadia2@proveit.test" }];
    expect(matchNotionPerson({ email: "NADIA@proveit.test" }, employees)).toEqual({ status: "matched", employeeId: "P-001" });
    expect(matchNotionPerson({ name: "Nadia Patel" }, employees)).toEqual({ status: "ambiguous" });
    expect(matchNotionPerson({ name: "Unknown" }, employees)).toEqual({ status: "unresolved" });
    expect(matchNotionPerson({ name: "Nadia" }, [{ employeeId: "P-001", name: "Nadia" }])).toEqual({ status: "unresolved" });
  });

  it("splits only Person-field values into independent, deduplicated identities", () => {
    expect(splitNotionPersonValue("Dhairya Singhal, Neil Dsouza")).toEqual(["Dhairya Singhal", "Neil Dsouza"]);
    expect(splitNotionPersonValue("A, B, C, D, E, F, G")).toHaveLength(7);
    expect(splitNotionPersonValue("Dhairya Singhal, Dhairya Singhal")).toEqual(["Dhairya Singhal"]);
  });

  it("detects duplicate source IDs and blocks a ready-to-import summary", async () => {
    const inner = storedZip([
      { name: "A 35b4e1e1942580123456789abcdef012.html", data: "<title>A</title>" },
      { name: "B 35b4e1e1942580123456789abcdef012.html", data: "<title>B</title>" },
    ]);
    const model = await analyzeNotionExportArchives([{ name: "outer.zip", bytes: storedZip([{ name: "ExportBlock-Part-1.zip", data: inner }]) }]);
    expect(model.duplicateSourceIds).toHaveLength(1);
    expect(summarizeNotionDryRun(model)).toMatchObject({ readyToImport: 0, needsReview: expect.any(Number) });
  });
});
