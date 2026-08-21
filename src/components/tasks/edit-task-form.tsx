"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getUsers } from "@/lib/users";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import { useAuth } from "@/components/auth-provider";
import CustomFieldProperties from "@/components/tasks/custom-field-properties";
import { saveTaskCustomFields } from "@/lib/task-custom-fields";
import { syncWorkspaceTaskDelete, syncWorkspaceTaskUpdate } from "@/lib/kaneo-business-task-update-sync";
import { type CustomFieldValue } from "@/lib/custom-fields";
import { updateTaskAssigneeOnServer } from "@/lib/task-mutation-client";
import { Button } from "@/components/ui/button";
import { controlClassName, FieldLabel, FormControl } from "@/components/ui/form-control";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/ui/task-metadata";

import { ProveItUser } from "@/types/user";

export type EditableTaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done";

export type EditableTaskPriority =
  | "low"
  | "medium"
  | "high"
  | "urgent";

export interface EditableTask {
  id: string;
  title: string;
  description: string;
  workspaceId: string;
  status: EditableTaskStatus;
  priority: EditableTaskPriority;
  assigneeId?: string | null;
  dueDate?: Date;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  customFields?: Record<string, CustomFieldValue>;
  integration?: { kaneo?: { syncState?: "synced" | "failed" | "ambiguous" | "partial" } };
}

interface EditTaskFormProps {
  task: EditableTask;
  onSaved: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onCancel: () => void;
}

export default function EditTaskForm({
  task,
  onSaved,
  onDeleted,
  onCancel,
}: EditTaskFormProps) {
  const { firebaseUser, profile } = useAuth();
  const [title, setTitle] =
    useState(task.title);

  const [description, setDescription] =
    useState(task.description || "");

  const [status, setStatus] =
    useState<EditableTaskStatus>(
      task.status
    );

  const [priority, setPriority] =
    useState<EditableTaskPriority>(
      task.priority
    );

  const [assigneeId, setAssigneeId] =
    useState(
      task.assigneeId || ""
    );

  const [dueDate, setDueDate] =
    useState(
      task.dueDate
        ? formatDateForInput(
            task.dueDate
          )
        : ""
    );

  const [employees, setEmployees] =
    useState<ProveItUser[]>([]);

  const [
    loadingEmployees,
    setLoadingEmployees,
  ] = useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [confirmingDelete, setConfirmingDelete] =
    useState(false);

  const [error, setError] =
    useState("");

  const [customFields, setCustomFields] = useState<Record<string, CustomFieldValue>>(task.customFields ?? {});
  const [workspaceCanManageProperties, setWorkspaceCanManageProperties] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!firebaseUser) return;
    void getMembershipsForWorkspace(task.workspaceId).then((memberships) => {
      const membership = memberships.find((item) => item.userId === firebaseUser.uid);
      if (!cancelled) setWorkspaceCanManageProperties(membership?.role === "manager" || membership?.role === "admin");
    }).catch(() => { if (!cancelled) setWorkspaceCanManageProperties(false); });
    return () => { cancelled = true; };
  }, [firebaseUser, task.workspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      try {
        setLoadingEmployees(true);

        const users =
          await getUsers();

        const activeUsers =
          users.filter(
            (user) => user.active
          );

        let assignableUsers:
          ProveItUser[] = [];

        if (
          task.workspaceId ===
          "company"
        ) {
          assignableUsers =
            activeUsers;
        } else if (
          task.workspaceId ===
          "board"
        ) {
          assignableUsers =
            activeUsers.filter(
              (user) =>
                user.group === "bod"
            );
        } else {
          const memberships =
            await getMembershipsForWorkspace(
              task.workspaceId
            );

          const memberIds =
            new Set(
              memberships.map(
                (membership) =>
                  membership.userId
              )
            );

          assignableUsers =
            activeUsers.filter(
              (user) =>
                user.group === "bod" ||
                memberIds.has(
                  user.uid
                )
            );
        }

        /*
         * Preserve the current assignee
         * in the dropdown even if their
         * membership changed after this
         * task was created.
         */
        if (
          task.assigneeId &&
          !assignableUsers.some(
            (user) =>
              user.uid ===
              task.assigneeId
          )
        ) {
          const existingAssignee =
            users.find(
              (user) =>
                user.uid ===
                task.assigneeId
            );

          if (existingAssignee) {
            assignableUsers.push(
              existingAssignee
            );
          }
        }

        assignableUsers.sort(
          (a, b) =>
            (a.name || "")
              .localeCompare(
                b.name || ""
              )
        );

        if (!cancelled) {
          setEmployees(
            assignableUsers
          );
        }
      } catch (error) {
        console.error(
          "Failed to load assignable employees:",
          error
        );

        if (!cancelled) {
          setError(
            "Employees could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingEmployees(
            false
          );
        }
      }
    }

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [
    task.workspaceId,
    task.assigneeId,
  ]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setError(
        "Task title is required."
      );

      return;
    }

    try {
      setSaving(true);
      setError("");

      const taskRef = doc(
        db,
        "tasks",
        task.id
      );

      await updateDoc(
        taskRef,
        {
          title: cleanTitle,

          description:
            description.trim(),

          status,

          priority,

          dueDate: dueDate
            ? Timestamp.fromDate(
                new Date(
                  `${dueDate}T12:00:00`
                )
              )
            : null,

          updatedAt:
            serverTimestamp(),
        }
      );

      if (!firebaseUser) throw new Error("Authentication required.");
      try {
        const assignment = await updateTaskAssigneeOnServer(firebaseUser, task.workspaceId, task.id, assigneeId || null);
        if (assignment.notificationWarning) setError("Task saved, and its assignment notification is queued for retry.");
      } catch {
        setError("Task details were saved, but its assignment could not be updated.");
      }

      if (firebaseUser) {
        const fields = (["title", "description", "status", "priority"] as const).filter((field) => task[field] !== ({ title: cleanTitle, description: description.trim(), status, priority } as typeof task)[field]);
        const sync = await syncWorkspaceTaskUpdate(firebaseUser, task.workspaceId, task.id, [...fields]);
        if (sync && sync.state !== "synced") setError(sync.message || "Task saved, but external sync was not confirmed.");
      }

      if (firebaseUser) {
        const customSaved = await saveTaskCustomFields(firebaseUser, task.id, customFields);
        if (!customSaved) setError("Task saved, but custom properties could not be saved.");
      }

      await onSaved();
    } catch (error) {
      console.error(
        "Failed to update task:",
        error
      );

      const errorCode =
        typeof error === "object"
        && error !== null
        && "code" in error
          ? String(error.code)
          : "";

      if (errorCode === "permission-denied") {
        setError(
          "You don't currently have permission to update this task. Contact a workspace administrator if you believe this is incorrect."
        );
      } else {
        setError(
          "Task could not be updated."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      setError("");

      const taskRef = doc(
        db,
        "tasks",
        task.id
      );

      if (firebaseUser && !(await syncWorkspaceTaskDelete(firebaseUser, task.workspaceId, task.id))) {
        setError("Task was not deleted because external sync failed.");
        return;
      }

      await deleteDoc(taskRef);

      await onDeleted();
    } catch (error) {
      console.error(
        "Failed to delete task:",
        error
      );

      const errorCode =
        typeof error === "object"
        && error !== null
        && "code" in error
          ? String(error.code)
          : "";

      if (errorCode === "permission-denied") {
        setError(
          "You don't currently have permission to delete this task. Contact a workspace administrator if you believe this is incorrect."
        );
      } else {
        setError(
          "Task could not be deleted."
        );
      }
    } finally {
      setDeleting(false);
    }
  }

  const busy =
    saving || deleting;

  return (
    <div className="pb-8">
      <div>
        <p className="proveit-label">Task details</p>
        <h2 className="proveit-heading mt-1 text-xl font-semibold tracking-[-0.03em]">
          Edit task
        </h2>

        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Update ownership,
          status, priority and
          deadline.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        role="region"
        aria-label="Task properties"
        className="mt-6 space-y-5"
      >
        {/* TITLE */}

        <FormControl label="Task title" required>
          <input
            required
            autoFocus
            aria-label="Task title"
            value={title}
            disabled={busy}
            onChange={(event) =>
              setTitle(
                event.target.value
              )
            }
            className={`${controlClassName} disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </FormControl>

        <CustomFieldProperties workspaceId={task.workspaceId} values={customFields} onChange={setCustomFields} people={employees} compact canManage={workspaceCanManageProperties || profile?.group === "bod" || profile?.capabilities?.manageWorkspaces === true} onPersist={async (next) => firebaseUser ? saveTaskCustomFields(firebaseUser, task.id, next) : false} />

        {/* DESCRIPTION */}

        <FormControl label="Description" helperText="Add the context a teammate needs to complete this work.">
          <textarea
            rows={4}
            value={description}
            disabled={busy}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            className={`${controlClassName} resize-y disabled:cursor-not-allowed disabled:opacity-60`}
          />
        </FormControl>

        {/* DETAILS */}

        <div className="grid gap-4 sm:grid-cols-2">

          {/* STATUS */}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3"><FieldLabel htmlFor={`task-status-${task.id}`} className="mb-0">Status</FieldLabel><TaskStatusBadge status={status} /></div>

            <select
              id={`task-status-${task.id}`}
              aria-label="Task status"
              value={status}
              disabled={busy}
              onChange={(event) =>
                setStatus(
                  event.target
                    .value as EditableTaskStatus
                )
              }
              className={`${controlClassName} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <option value="todo">
                To do
              </option>

              <option value="in_progress">
                In progress
              </option>

              <option value="blocked">
                Blocked
              </option>

              <option value="done">
                Done
              </option>
            </select>
          </div>

          {/* PRIORITY */}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3"><FieldLabel htmlFor={`task-priority-${task.id}`} className="mb-0">Priority</FieldLabel><TaskPriorityBadge priority={priority} /></div>

            <select
              id={`task-priority-${task.id}`}
              aria-label="Task priority"
              value={priority}
              disabled={busy}
              onChange={(event) =>
                setPriority(
                  event.target
                    .value as EditableTaskPriority
                )
              }
              className={`${controlClassName} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <option value="low">
                Low
              </option>

              <option value="medium">
                Medium
              </option>

              <option value="high">
                High
              </option>

              <option value="urgent">
                Urgent
              </option>
            </select>
          </div>

          {/* ASSIGNEE */}

          <FormControl label="Assignee" helperText={loadingEmployees ? "Loading workspace members…" : "Assignment changes notify the selected employee."}>
            <select
              value={assigneeId}
              disabled={
                busy ||
                loadingEmployees
              }
              onChange={(event) =>
                setAssigneeId(
                  event.target.value
                )
              }
              className={`${controlClassName} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <option value="">
                {loadingEmployees
                  ? "Loading employees..."
                  : "Unassigned"}
              </option>

              {employees.map(
                (employee) => (
                  <option
                    key={
                      employee.uid
                    }
                    value={
                      employee.uid
                    }
                  >
                    {employee.name}
                    {employee.employeeId
                      ? ` — ${employee.employeeId}`
                      : ""}
                  </option>
                )
              )}
            </select>
          </FormControl>

          {/* DUE DATE */}

          <FormControl label="Due date">
            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(event) =>
                setDueDate(
                  event.target.value
                )
              }
              className={`${controlClassName} disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </FormControl>
        </div>

        {/* ERROR */}

        {error && (
          <div role="alert" className="proveit-toast px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ACTIONS */}

        {confirmingDelete && (
          <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--background)] p-4">
            <p className="text-sm font-medium">Delete this task permanently?</p>
            <p className="mt-1 text-sm text-[var(--muted)]">This action cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="danger" loading={deleting} loadingLabel="Deleting…" disabled={busy} onClick={handleDelete}>Delete permanently</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmingDelete(false)}>Keep task</Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            Delete task
          </Button>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              loading={saving}
              loadingLabel="Saving…"
              disabled={deleting}
            >
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function formatDateForInput(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
