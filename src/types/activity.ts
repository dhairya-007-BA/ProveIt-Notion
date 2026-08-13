export type ActivityAction =
  | "created"
  | "updated"
  | "assigned"
  | "status_changed"
  | "commented"
  | "completed"
  | "archived"
  | "restored"
  | "imported";

export interface ActivityEvent {
  id: string;

workspaceId: string;

  entityType:
    | "task"
    | "meeting"
    | "document"
    | "customer"
    | "expense"
    | "budget"
    | "workspace";

  entityId: string;

  action: ActivityAction;

  userId?: string;
  userName?: string;

  description: string;

  previousValue?: unknown;
  newValue?: unknown;

  createdAt: Date;

  source?: "proveit" | "notion";
}