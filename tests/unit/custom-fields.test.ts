import { describe, expect, it } from "vitest";
import { CUSTOM_FIELD_LIMITS, normalizeOptions, validateCustomFieldValue } from "@/lib/custom-fields";

const select = { type: "single_select" as const, required: true, options: ["Engineering", "Sales"] };

describe("custom field validation", () => {
  it("accepts supported, bounded values", () => {
    expect(validateCustomFieldValue({ type: "text", required: false, options: [] }, " Acme ", new Set())).toBe("Acme");
    expect(validateCustomFieldValue({ type: "number", required: false, options: [] }, 12.5, new Set())).toBe(12.5);
    expect(validateCustomFieldValue({ type: "date", required: false, options: [] }, "2026-08-15", new Set())).toBe("2026-08-15");
    expect(validateCustomFieldValue({ type: "checkbox", required: false, options: [] }, true, new Set())).toBe(true);
    expect(validateCustomFieldValue({ type: "url", required: false, options: [] }, "https://proveit.test/path", new Set())).toBe("https://proveit.test/path");
    expect(validateCustomFieldValue({ type: "person", required: true, options: [] }, "member-1", new Set(["member-1"]))).toBe("member-1");
    expect(validateCustomFieldValue({ type: "single_select", required: false, options: ["Engineering"] }, "Engineering", new Set())).toBe("Engineering");
    expect(validateCustomFieldValue({ type: "multi_select", required: false, options: ["Engineering", "Sales"] }, ["Engineering", "Sales"], new Set())).toEqual(["Engineering", "Sales"]);
  });
  it("rejects invalid values, required omissions, and cross-workspace people", () => {
    expect(validateCustomFieldValue(select, "Marketing", new Set())).toBeUndefined();
    expect(validateCustomFieldValue(select, null, new Set())).toBeUndefined();
    expect(validateCustomFieldValue({ type: "number", required: false, options: [] }, Number.NaN, new Set())).toBeUndefined();
    expect(validateCustomFieldValue({ type: "date", required: false, options: [] }, "not-a-date", new Set())).toBeUndefined();
    expect(validateCustomFieldValue({ type: "checkbox", required: false, options: [] }, "true", new Set())).toBeUndefined();
    expect(validateCustomFieldValue({ type: "url", required: false, options: [] }, "javascript:alert(1)", new Set())).toBeUndefined();
    expect(validateCustomFieldValue({ type: "person", required: true, options: [] }, "other-workspace-user", new Set(["member-1"]))).toBeUndefined();
    expect(validateCustomFieldValue({ type: "multi_select", required: false, options: ["Engineering"] }, ["Unknown"], new Set())).toBeUndefined();
  });
  it("normalizes select options and rejects duplicates", () => {
    expect(normalizeOptions(["One", "Two"], "multi_select")).toEqual(["One", "Two"]);
    expect(normalizeOptions(["One", " one "], "single_select")).toBeNull();
    expect(normalizeOptions([], "single_select")).toBeNull();
    expect(CUSTOM_FIELD_LIMITS.fieldsPerWorkspace).toBe(40);
  });
});
