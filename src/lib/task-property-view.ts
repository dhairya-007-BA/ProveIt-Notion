import { type CustomFieldValue, type WorkspaceCustomField } from "@/lib/custom-fields";

export type CustomPropertyFilter = { fieldId: string; operator: string; value?: string };

function absent(value: CustomFieldValue | undefined) { return value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length); }

export function matchesCustomPropertyFilter(value: CustomFieldValue | undefined, field: WorkspaceCustomField, filter: CustomPropertyFilter) {
  if (filter.operator === "is_empty") return absent(value);
  if (filter.operator === "is_not_empty") return !absent(value);
  if (field.type === "checkbox") return filter.operator === "checked" ? value === true : value !== true;
  if (absent(value)) return false;
  const expected = filter.value ?? "";
  if (field.type === "number") { const actual = typeof value === "number" ? value : Number(value); const target = Number(expected); if (!Number.isFinite(actual) || !Number.isFinite(target)) return false; return filter.operator === "equals" ? actual === target : filter.operator === "not_equals" ? actual !== target : filter.operator === "greater_than" ? actual > target : filter.operator === "greater_than_or_equal" ? actual >= target : filter.operator === "less_than" ? actual < target : actual <= target; }
  if (field.type === "multi_select") { const selected = Array.isArray(value) ? value : []; return filter.operator === "contains" ? selected.includes(expected) : !selected.includes(expected); }
  const actual = String(value);
  if (field.type === "date") return filter.operator === "before" ? actual < expected : filter.operator === "after" ? actual > expected : actual === expected;
  if (field.type === "single_select" || field.type === "person") return filter.operator === "is" ? actual === expected : actual !== expected;
  const normalized = actual.toLocaleLowerCase(), target = expected.toLocaleLowerCase();
  return filter.operator === "contains" ? normalized.includes(target) : filter.operator === "is" ? normalized === target : normalized !== target;
}

export function compareCustomPropertyValues(left: CustomFieldValue | undefined, right: CustomFieldValue | undefined, field: WorkspaceCustomField, personName: (uid: string) => string) {
  if (absent(left) || absent(right)) return absent(left) === absent(right) ? 0 : absent(left) ? 1 : -1;
  const value = (input: CustomFieldValue) => field.type === "person" && typeof input === "string" ? personName(input) : input;
  const a = value(left!), b = value(right!);
  if (field.type === "number") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}
