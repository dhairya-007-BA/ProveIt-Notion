import { describe, expect, it } from "vitest";
import { compareCustomPropertyValues, matchesCustomPropertyFilter } from "@/lib/task-property-view";

const text = { id: "client", workspaceId: "business", name: "Client", type: "text" as const, description: "", required: false, options: [], position: 0, active: true };
const number = { ...text, id: "estimate", type: "number" as const };
const multi = { ...text, id: "teams", type: "multi_select" as const, options: ["Design", "Product"] };
const person = { ...text, id: "reviewer", type: "person" as const };

describe("task custom property view helpers", () => {
  it("filters text, numeric, and multi-select values deterministically", () => {
    expect(matchesCustomPropertyFilter("Acme", text, { fieldId: "client", operator: "contains", value: "cm" })).toBe(true);
    expect(matchesCustomPropertyFilter(12, number, { fieldId: "estimate", operator: "greater_than", value: "8" })).toBe(true);
    expect(matchesCustomPropertyFilter(["Design"], multi, { fieldId: "teams", operator: "contains", value: "Design" })).toBe(true);
    expect(matchesCustomPropertyFilter(null, text, { fieldId: "client", operator: "is_empty" })).toBe(true);
  });
  it("sorts people by resolved employee name and consistently places empty values last", () => {
    expect(compareCustomPropertyValues("uid-a", "uid-b", person, (uid) => uid === "uid-a" ? "Zoe" : "Ada")).toBeGreaterThan(0);
    expect(compareCustomPropertyValues(null, "Acme", text, () => "")).toBeGreaterThan(0);
  });
});
