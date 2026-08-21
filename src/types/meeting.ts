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

export const meetingIntelligenceStatuses = ["not_started", "processing", "completed", "failed"] as const;

export type MeetingIntelligenceStatus = (typeof meetingIntelligenceStatuses)[number];

export interface MeetingIntelligenceError {
  code: "provider_unavailable" | "provider_timeout" | "provider_error" | "invalid_provider_response";
  message: string;
  retryable: boolean;
}

export interface MeetingIntelligenceActionItem {
  id: string;
  title: string;
  details: string;
  suggestedAssignee: string;
  suggestedDueDate: string;
}

export interface MeetingIntelligenceOutput {
  summary: string;
  decisions: string[];
  risks: string[];
  actionItems: MeetingIntelligenceActionItem[];
  followUps: string[];
}

export interface MeetingIntelligenceProcess {
  status: MeetingIntelligenceStatus;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  error: MeetingIntelligenceError | null;
}

export interface MeetingIntelligenceRecord {
  meetingId: string;
  workspaceId: string;
  rawTranscript: string;
  rawTranscriptSource: "whisper" | null;
  transcription: MeetingIntelligenceProcess;
  analysis: MeetingIntelligenceProcess & {
    inputSource: "raw_transcript" | "meeting_transcript" | null;
    inputFingerprint: string | null;
    output: MeetingIntelligenceOutput | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MeetingIntelligenceAvailability {
  transcription: { available: boolean; message: string };
  analysis: { available: boolean; message: string };
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
