export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done";

export type TaskPriority =
  | "low"
  | "medium"
  | "high"
  | "urgent";

export interface ProveItTask {
  id: string;

  title: string;
  description: string;

  workspaceId: string;

  status: TaskStatus;
  priority: TaskPriority;

  assigneeId?: string | null;

  createdBy: string;

  dueDate?: Date;

  createdAt?: Date;
  updatedAt?: Date;

  source?: "proveit" | "notion";

  originalNotionId?: string;
  originalCreatedAt?: Date;
  originalLastEditedAt?: Date;

  parentTaskId?: string;
  meetingId?: string;
  customerId?: string;

  documentIds?: string[];

  archived?: boolean;
}
