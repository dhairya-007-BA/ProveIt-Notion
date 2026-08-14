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

  const [error, setError] =
    useState("");

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
      } else if (error instanceof Error) {
        setError(error.message);
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
    const confirmed =
      window.confirm(
        `Delete "${task.title}"? This cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      const taskRef = doc(
        db,
        "tasks",
        task.id
      );

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
      } else if (error instanceof Error) {
        setError(error.message);
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
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Task
        </p>

        <h2 className="mt-1 text-lg font-semibold">
          Edit task
        </h2>

        <p className="mt-1 text-sm text-gray-500">
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
          <label className="mb-2 block text-sm font-medium text-gray-700">
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
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400 disabled:bg-gray-50"
          />
        </div>

        {/* DESCRIPTION */}

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
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
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400 disabled:bg-gray-50"
          />
        </div>

        {/* DETAILS */}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

          {/* STATUS */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
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
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm disabled:bg-gray-50"
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
            <label className="mb-2 block text-sm font-medium text-gray-700">
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
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm disabled:bg-gray-50"
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
            <label className="mb-2 block text-sm font-medium text-gray-700">
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
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
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
            <label className="mb-2 block text-sm font-medium text-gray-700">
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
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50"
            />
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ACTIONS */}

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting
              ? "Deleting..."
              : "Delete task"}
          </button>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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
