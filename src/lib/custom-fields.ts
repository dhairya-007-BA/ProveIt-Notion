export const CUSTOM_FIELD_TYPES = [
  "text", "number", "date", "checkbox", "single_select", "multi_select", "url", "person",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type CustomFieldValue = string | number | boolean | string[] | null;

export type WorkspaceCustomField = {
  id: string;
  workspaceId: string;
  name: string;
  type: CustomFieldType;
  description: string;
  required: boolean;
  options: string[];
  position: number;
  active: boolean;
  createdBy?: string;
};

export const CUSTOM_FIELD_LIMITS = {
  fieldsPerWorkspace: 40,
  nameLength: 80,
  descriptionLength: 300,
  optionsPerField: 50,
  optionLength: 80,
  textLength: 2000,
  urlLength: 2048,
  multiSelectValues: 20,
} as const;

export function isCustomFieldType(value: unknown): value is CustomFieldType {
  return typeof value === "string" && (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

export function normalizeLabel(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

export function normalizeOptions(value: unknown, type: CustomFieldType) {
  if (type !== "single_select" && type !== "multi_select") return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > CUSTOM_FIELD_LIMITS.optionsPerField) return null;
  const options = value.map((item) => normalizeLabel(item, CUSTOM_FIELD_LIMITS.optionLength));
  if (options.some((item) => item === null)) return null;
  const normalized = options as string[];
  return new Set(normalized.map((item) => item.toLocaleLowerCase())).size === normalized.length ? normalized : null;
}

export function validateCustomFieldValue(
  field: Pick<WorkspaceCustomField, "type" | "required" | "options">,
  rawValue: unknown,
  allowedPersonIds: Set<string>
): CustomFieldValue | undefined {
  const absent = rawValue === undefined || rawValue === null || rawValue === "" || (Array.isArray(rawValue) && rawValue.length === 0);
  if (absent) return field.required ? undefined : null;

  if (field.type === "text") return normalizeLabel(rawValue, CUSTOM_FIELD_LIMITS.textLength) ?? undefined;
  if (field.type === "number") return typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : undefined;
  if (field.type === "checkbox") return typeof rawValue === "boolean" ? rawValue : undefined;
  if (field.type === "date") return typeof rawValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawValue) && !Number.isNaN(Date.parse(`${rawValue}T00:00:00Z`)) ? rawValue : undefined;
  if (field.type === "url") {
    const url = normalizeLabel(rawValue, CUSTOM_FIELD_LIMITS.urlLength);
    if (!url) return undefined;
    try { const parsed = new URL(url); return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined; } catch { return undefined; }
  }
  if (field.type === "person") return typeof rawValue === "string" && allowedPersonIds.has(rawValue) ? rawValue : undefined;
  if (field.type === "single_select") return typeof rawValue === "string" && field.options.includes(rawValue) ? rawValue : undefined;
  if (field.type === "multi_select") {
    if (!Array.isArray(rawValue) || rawValue.length > CUSTOM_FIELD_LIMITS.multiSelectValues || rawValue.some((item) => typeof item !== "string" || !field.options.includes(item))) return undefined;
    return new Set(rawValue).size === rawValue.length ? rawValue : undefined;
  }
  return undefined;
}
