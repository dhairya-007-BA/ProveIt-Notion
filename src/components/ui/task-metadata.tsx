import type { TaskPriority, TaskStatus } from "@/types/task";
import { cn } from "@/components/ui/utils";

export const TASK_STATUS_META: Record<TaskStatus, { label: string; className: string; icon: "circle" | "progress" | "blocked" | "check" }> = {
  todo: { label: "To do", className: "proveit-task-status-todo", icon: "circle" },
  in_progress: { label: "In progress", className: "proveit-task-status-in-progress", icon: "progress" },
  blocked: { label: "Blocked", className: "proveit-task-status-blocked", icon: "blocked" },
  done: { label: "Done", className: "proveit-task-status-done", icon: "check" },
};

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "proveit-priority-low" },
  medium: { label: "Medium", className: "proveit-priority-medium" },
  high: { label: "High", className: "proveit-priority-high" },
  urgent: { label: "Urgent", className: "proveit-priority-urgent" },
};

export function TaskStatusBadge({ className, status }: { className?: string; status: TaskStatus }) {
  const meta = TASK_STATUS_META[status];
  return <span className={cn("proveit-status-badge gap-1.5", meta.className, className)}><StatusIcon type={meta.icon} /><span>{meta.label}</span></span>;
}

export function TaskPriorityBadge({ className, priority }: { className?: string; priority: TaskPriority }) {
  const meta = TASK_PRIORITY_META[priority];
  return <span className={cn("proveit-priority inline-flex items-center gap-1.5 font-medium", meta.className, className)}><PriorityIcon priority={priority} /><span>{meta.label}</span></span>;
}

function StatusIcon({ type }: { type: (typeof TASK_STATUS_META)[TaskStatus]["icon"] }) {
  if (type === "check") return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" /><path d="m5 8 2 2 4-4" /></svg>;
  if (type === "blocked") return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" /><path d="m4 4 8 8" /></svg>;
  if (type === "progress") return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" opacity=".35" /><path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="5.5" /></svg>;
}

function PriorityIcon({ priority }: { priority: TaskPriority }) {
  const bars = priority === "low" ? 1 : priority === "medium" ? 2 : priority === "high" ? 3 : 4;
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">{[0, 1, 2, 3].map((bar) => <rect key={bar} x={1 + bar * 4} y={11 - bar * 2} width="2.5" height={3 + bar * 2} rx="1" opacity={bar < bars ? 1 : 0.22} />)}</svg>;
}
