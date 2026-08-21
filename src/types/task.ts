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
  provenance?: {
    type: "meeting_ai_action_item";
    meetingId: string;
    proposalId: string;
    sourceTitle: string;
    approvedBy: string;
    approvedAt?: Date;
  };
  customerId?: string;

  documentIds?: string[];

  archived?: boolean;

  customFields?: Record<string, string | number | boolean | string[] | null>;

  integration?: {
    kaneo?: {
      taskId?: string;
      projectId: string;
      syncState?: "creating" | "synced" | "failed" | "ambiguous" | "retry_permitted" | "partial";
      creationFingerprint?: string;
      creationAttempt?: number;
      requestedAt?: Date;
      reconciledAt?: Date;
      syncedAt?: Date;
      lastSyncAt?: Date;
    };
  };
}
