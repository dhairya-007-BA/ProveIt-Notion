export interface MeetingAttendee {
  userId?: string;
  name: string;
}

export interface MeetingActionItem {
  id: string;
  title: string;
  assigneeId?: string;
  completed: boolean;
  taskId?: string;
}

export interface ProveItMeeting {
  id: string;

  title: string;

  workspaceId: string;

  meetingDate: Date;

  attendees: MeetingAttendee[];

  summary?: string;
  notes?: string;
  transcript?: string;

  decisions?: string[];

  actionItems?: MeetingActionItem[];

  createdBy: string;
  createdAt: Date;
  updatedAt: Date;

  source?: "proveit" | "notion";

  originalNotionId?: string;
  originalCreatedAt?: Date;
  originalLastEditedAt?: Date;

  archived: boolean;
}