export type ActivityLinkInput = { workspaceId: string; entityType?: unknown; entityId?: unknown };

export function activityHref({ workspaceId, entityType, entityId }: ActivityLinkInput) {
  if (typeof entityId !== "string" || !entityId) return null;
  const prefix = `/workspaces/${workspaceId}`;
  if (entityType === "task") return `${prefix}/tasks?task=${entityId}`;
  if (entityType === "document") return `${prefix}/documents/${entityId}`;
  if (entityType === "meeting") return `${prefix}/meetings/${entityId}`;
  if (entityType === "database-row") {
    const [databaseId, rowId] = entityId.split(":");
    return databaseId && rowId ? `${prefix}/databases/${databaseId}/rows/${rowId}` : null;
  }
  return null;
}
