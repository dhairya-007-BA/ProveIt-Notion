"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { User } from "firebase/auth";

import { createTask } from "@/lib/tasks";
import { getUsers } from "@/lib/users";
import { getMembershipsForWorkspace } from "@/lib/memberships";

import { ProveItUser } from "@/types/user";
import {
  TaskPriority,
  TaskStatus,
} from "@/types/task";

interface NewTaskFormProps {
  workspaceId: string;
  currentUser: User;
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
}

export default function NewTaskForm({
  workspaceId,
  currentUser,
  onCreated,
  onCancel,
}: NewTaskFormProps) {
  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [status, setStatus] =
    useState<TaskStatus>("todo");

  const [priority, setPriority] =
    useState<TaskPriority>("medium");

  const [dueDate, setDueDate] =
    useState("");

  const [assigneeId, setAssigneeId] =
    useState("");

  const [employees, setEmployees] =
    useState<ProveItUser[]>([]);

  const [
    loadingEmployees,
    setLoadingEmployees,
  ] = useState(true);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      try {
        setLoadingEmployees(true);
        setError("");

        const users =
          await getUsers();

        const activeUsers =
          users.filter(
            (user) => user.active
          );

        let assignableUsers:
          ProveItUser[] = [];

        /*
         * COMPANY
         *
         * Every active employee can
         * receive Company tasks.
         */
        if (
          workspaceId === "company"
        ) {
          assignableUsers =
            activeUsers;
        }

        /*
         * BOARD
         *
         * Only BOD users can receive
         * Board tasks.
         */
        else if (
          workspaceId === "board"
        ) {
          assignableUsers =
            activeUsers.filter(
              (user) =>
                user.group === "bod"
            );
        }

        /*
         * OTHER WORKSPACES
         *
         * Explicit members + BOD.
         */
        else {
          const memberships =
            await getMembershipsForWorkspace(
              workspaceId
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
  }, [workspaceId]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setError(
        "Task title is required."
      );

      return;
    }

    try {
      setLoading(true);

      /*
       * IMPORTANT:
       *
       * Task creation now goes through
       * the central task library instead
       * of writing directly to Firestore.
       *
       * This allows task creation and
       * activity logging to happen
       * together.
       */
      await createTask({
        title: cleanTitle,

        description:
          description.trim(),

        workspaceId,

        status,

        priority,

        assigneeId:
          assigneeId || null,

        dueDate: dueDate
          ? new Date(
              `${dueDate}T12:00:00`
            )
          : null,

        createdBy:
          currentUser.uid,
      });

      /*
       * Reset form after successful
       * creation.
       */
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setDueDate("");
      setAssigneeId("");

      await onCreated();
    } catch (error) {
      console.error(
        "Failed to create task:",
        error
      );

      if (
        error instanceof Error
      ) {
        setError(
          error.message
        );
      } else {
        setError(
          "Task could not be created."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold">
          New task
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Add work to this workspace.
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
            onChange={(event) =>
              setTitle(
                event.target.value
              )
            }
            placeholder="Prepare investor update"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400"
          />
        </div>

        {/* DESCRIPTION */}

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Description
          </label>

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            rows={4}
            placeholder="Add context, requirements or notes..."
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400"
          />
        </div>

        {/* TASK DETAILS */}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

          {/* STATUS */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Status
            </label>

            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target
                    .value as TaskStatus
                )
              }
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"
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
              onChange={(event) =>
                setPriority(
                  event.target
                    .value as TaskPriority
                )
              }
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"
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
              onChange={(event) =>
                setDueDate(
                  event.target.value
                )
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
          </div>
        </div>

        {/* ASSIGNMENT INFO */}

        <div className="rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-600">
            {assigneeId
              ? "This task will be assigned to the selected employee."
              : "This task will be created unassigned."}
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ACTIONS */}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
