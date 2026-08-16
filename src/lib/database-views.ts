export const DATABASE_VIEW_LIMITS = {
  nameLength: 100,
  filters: 20,
  visibleProperties: 50,
} as const;

export type DatabaseViewProperty = { id: string; type: string };
export type DatabaseViewFilter = {
  id: string;
  propertyId: string;
  operator: string;
  value?: string;
};
export type DatabaseViewSort = { propertyId: string; direction: "asc" | "desc" };
export type DatabaseViewState = {
  filters: DatabaseViewFilter[];
  sort: DatabaseViewSort | null;
  visiblePropertyIds: string[];
  propertyOrder: string[];
};

const operatorsByType: Record<string, readonly string[]> = {
  number: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty"],
  date: ["is", "before", "after", "on_or_before", "on_or_after", "is_empty", "is_not_empty"],
  checkbox: ["is_checked", "is_unchecked"],
  select: ["is", "is_not", "is_empty", "is_not_empty"],
  title: ["contains", "does_not_contain", "is", "is_not", "is_empty", "is_not_empty"],
  text: ["contains", "does_not_contain", "is", "is_not", "is_empty", "is_not_empty"],
  url: ["contains", "does_not_contain", "is", "is_not", "is_empty", "is_not_empty"],
  email: ["contains", "does_not_contain", "is", "is_not", "is_empty", "is_not_empty"],
  phone: ["contains", "does_not_contain", "is", "is_not", "is_empty", "is_not_empty"],
};

function label(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= DATABASE_VIEW_LIMITS.nameLength
    ? value.trim()
    : null;
}
function ids(value: unknown, validIds: Set<string>) {
  if (!Array.isArray(value) || value.length > DATABASE_VIEW_LIMITS.visibleProperties || value.some((id) => typeof id !== "string" || !validIds.has(id)) || new Set(value).size !== value.length) return null;
  return value;
}

export function validateDatabaseViewName(value: unknown) {
  return label(value);
}

export function validateDatabaseViewState(value: unknown, properties: DatabaseViewProperty[]): DatabaseViewState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["filters", "sort", "visiblePropertyIds", "propertyOrder"].includes(key))) return null;
  const validIds = new Set(properties.map((property) => property.id));
  const visiblePropertyIds = ids(body.visiblePropertyIds, validIds);
  const propertyOrder = ids(body.propertyOrder, validIds);
  if (!visiblePropertyIds || !propertyOrder || !Array.isArray(body.filters) || body.filters.length > DATABASE_VIEW_LIMITS.filters) return null;
  const filters: DatabaseViewFilter[] = [];
  for (const item of body.filters) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const filter = item as Record<string, unknown>;
    if (Object.keys(filter).some((key) => !["id", "propertyId", "operator", "value"].includes(key)) || typeof filter.id !== "string" || !filter.id || typeof filter.propertyId !== "string" || typeof filter.operator !== "string") return null;
    const property = properties.find((candidate) => candidate.id === filter.propertyId);
    if (!property || !operatorsByType[property.type]?.includes(filter.operator) || (filter.value !== undefined && (typeof filter.value !== "string" || filter.value.length > 200))) return null;
    filters.push({ id: filter.id, propertyId: filter.propertyId, operator: filter.operator, ...(typeof filter.value === "string" ? { value: filter.value } : {}) });
  }
  let sort: DatabaseViewSort | null = null;
  if (body.sort !== null) {
    if (typeof body.sort !== "object" || Array.isArray(body.sort)) return null;
    const candidate = body.sort as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => !["propertyId", "direction"].includes(key)) || typeof candidate.propertyId !== "string" || !validIds.has(candidate.propertyId) || (candidate.direction !== "asc" && candidate.direction !== "desc")) return null;
    sort = { propertyId: candidate.propertyId, direction: candidate.direction };
  }
  return { filters, sort, visiblePropertyIds, propertyOrder };
}
