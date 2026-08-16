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
import { syncBusinessTaskDelete, syncBusinessTaskUpdate } from "@/lib/kaneo-business-task-update-sync";
import { type CustomFieldValue } from "@/lib/custom-fields";

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

          assigneeId:
            assigneeId || null,

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

      if (firebaseUser) {
        const fields = (["title", "description", "status", "priority"] as const).filter((field) => task[field] !== ({ title: cleanTitle, description: description.trim(), status, priority } as typeof task)[field]);
        const sync = await syncBusinessTaskUpdate(firebaseUser, task.workspaceId, task.id, [...fields]);
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

      if (firebaseUser && !(await syncBusinessTaskDelete(firebaseUser, task.workspaceId, task.id))) {
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
        className="mt-6 space-y-5"
      >
        {/* TITLE */}

        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">
            Task title
          </label>

          <input
            required
            autoFocus
            value={title}
            disabled={busy}
            onChange={(event) =>
              setTitle(
                event.target.value
              )
            }
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-[var(--secondary)] disabled:opacity-60"
          />
        </div>

        <CustomFieldProperties workspaceId={task.workspaceId} values={customFields} onChange={setCustomFields} people={employees} compact canManage={workspaceCanManageProperties || profile?.group === "bod" || profile?.capabilities?.manageWorkspaces === true} onPersist={async (next) => firebaseUser ? saveTaskCustomFields(firebaseUser, task.id, next) : false} />

        {/* DESCRIPTION */}

        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">
            Description
          </label>

          <textarea
            rows={4}
            value={description}
            disabled={busy}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-[var(--secondary)] disabled:opacity-60"
          />
        </div>

        {/* DETAILS */}

        <div className="grid gap-4 sm:grid-cols-2">

          {/* STATUS */}

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">
              Status
            </label>

            <select
              value={status}
              disabled={busy}
              onChange={(event) =>
                setStatus(
                  event.target
                    .value as EditableTaskStatus
                )
              }
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm disabled:opacity-60"
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
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">
              Priority
            </label>

            <select
              value={priority}
              disabled={busy}
              onChange={(event) =>
                setPriority(
                  event.target
                    .value as EditableTaskPriority
                )
              }
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm disabled:opacity-60"
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

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">
              Assignee
            </label>

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
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm disabled:opacity-60"
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
          </div>

          {/* DUE DATE */}

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">
              Due date
            </label>

            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(event) =>
                setDueDate(
                  event.target.value
                )
              }
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--secondary)] disabled:opacity-60"
            />
          </div>
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
              <button type="button" disabled={busy} onClick={handleDelete} className="rounded-lg bg-[var(--danger)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete permanently"}</button>
              <button type="button" disabled={busy} onClick={() => setConfirmingDelete(false)} className="proveit-secondary-button disabled:opacity-50">Keep task</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--hover)] disabled:opacity-50"
          >
            Delete task
          </button>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="proveit-secondary-button disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy}
              className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save changes"}
            </button>
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
