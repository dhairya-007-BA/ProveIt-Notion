import { describe, expect, it } from "vitest";
import { filterDocuments } from "@/lib/document-search";

describe("document search", () => {
  const documents = [{ title: "Investor update" }, { title: "Hiring plan" }];
  it("filters only the documents already available in the workspace list", () => {
    expect(filterDocuments(documents, "INVESTOR")).toEqual([{ title: "Investor update" }]);
  });
  it("returns the current list for an empty search", () => {
    expect(filterDocuments(documents, "  ")).toEqual(documents);
  });
});
