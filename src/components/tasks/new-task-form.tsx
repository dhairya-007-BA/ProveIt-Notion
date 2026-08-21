"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { User } from "firebase/auth";

import { createTaskOnServer } from "@/lib/task-mutation-client";
import {
  createProveItTaskThenSyncWorkspaceKaneo,
  createTaskSubmissionGuard,
} from "@/lib/kaneo-business-task-sync";
import { getUsers } from "@/lib/users";
import { getMembershipsForWorkspace } from "@/lib/memberships";
import CustomFieldProperties from "@/components/tasks/custom-field-properties";
import { useAuth } from "@/components/auth-provider";
import { saveTaskCustomFields } from "@/lib/task-custom-fields";
import { type CustomFieldValue, type WorkspaceCustomField } from "@/lib/custom-fields";
import { Button } from "@/components/ui/button";
import { controlClassName, FieldLabel, FormControl } from "@/components/ui/form-control";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/ui/task-metadata";

import { ProveItUser } from "@/types/user";
import {
  TaskPriority,
  TaskStatus,
} from "@/types/task";

interface NewTaskFormProps {
  workspaceId: string;
  currentUser: User;
  initialStatus?: TaskStatus;
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
  onSyncNotice?: (message: string) => void;
}

export default function NewTaskForm({
  workspaceId,
  currentUser,
  initialStatus = "todo",
  onCreated,
  onCancel,
  onSyncNotice,
}: NewTaskFormProps) {
  const { firebaseUser, profile } = useAuth();
  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [status, setStatus] =
    useState<TaskStatus>(initialStatus);

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

  const [taskCreated, setTaskCreated] =
    useState(false);

  const [customFields, setCustomFields] = useState<Record<string, CustomFieldValue>>({});
  const [customDefinitions, setCustomDefinitions] = useState<WorkspaceCustomField[]>([]);
  const [workspaceCanManageProperties, setWorkspaceCanManageProperties] = useState(false);

  const submissionGuard = useRef(createTaskSubmissionGuard());

  useEffect(() => {
    let cancelled = false;
    if (!firebaseUser) return;
    void getMembershipsForWorkspace(workspaceId).then((memberships) => {
      const membership = memberships.find((item) => item.userId === firebaseUser.uid);
      if (!cancelled) setWorkspaceCanManageProperties(membership?.role === "manager" || membership?.role === "admin");
    }).catch(() => { if (!cancelled) setWorkspaceCanManageProperties(false); });
    return () => { cancelled = true; };
  }, [firebaseUser, workspaceId]);

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

    if (loading || taskCreated) {
      return;
    }

    setError("");

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setError(
        "Task title is required."
      );

      return;
    }

    if (customDefinitions.some((field) => {
      const value = customFields[field.id];
      return field.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0));
    })) {
      setError("Complete all required custom properties.");
      return;
    }

    if (!submissionGuard.current.tryAcquire()) {
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
      const result = await createProveItTaskThenSyncWorkspaceKaneo(
        () => createTaskOnServer(currentUser, {
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

        }),
        currentUser,
        workspaceId,
        {
          title: cleanTitle,
          description: description.trim(),
          priority,
        }
      );

      if (Object.keys(customFields).length > 0) {
        const saved = await saveTaskCustomFields(currentUser, result.proveItTaskId, customFields);
        if (!saved) onSyncNotice?.("Task created, but custom properties could not be saved.");
      }

      /*
       * Reset form after successful
       * creation.
       */
      setTitle("");
      setDescription("");
      setStatus(initialStatus);
      setPriority("medium");
      setDueDate("");
      setAssigneeId("");
      setCustomFields({});

      if (result.kaneoSync === "failed") {
        setTaskCreated(true);
        onSyncNotice?.("Task created, but external task sync failed.");
        await onCreated();
        return;
      }

      if (result.kaneoSync === "ambiguous") {
        setTaskCreated(true);
        onSyncNotice?.("Task created. External task sync could not be confirmed.");
        await onCreated();
        return;
      }

      await onCreated();
    } catch (error) {
      submissionGuard.current.release();
      console.error(
        "Failed to create task:",
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
          "You don't currently have permission to create tasks in this workspace. Contact a workspace administrator if you believe this is incorrect."
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
    <div className="flex min-h-full flex-col bg-[var(--surface)] p-5 sm:p-7">
      <div>
        <p className="proveit-label">Create work</p>
        <h2 className="proveit-heading mt-1 text-xl font-semibold tracking-[-0.03em]">
          New task
        </h2>

        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Add work to this workspace.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5"
      >
        {/* TITLE */}

        <FormControl label="Task title" required>
          <input
            required
            autoFocus
            aria-label="Task title"
            value={title}
            onChange={(event) =>
              setTitle(
                event.target.value
              )
            }
            placeholder="Prepare investor update"
            className={controlClassName}
          />
        </FormControl>

        {/* DESCRIPTION */}

        <FormControl label="Description" helperText="Add the context a teammate needs to complete this work.">
          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            rows={4}
            placeholder="Add context, requirements or notes..."
            className={`${controlClassName} resize-y`}
          />
        </FormControl>

        {/* TASK DETAILS */}

        <div className="grid gap-4 sm:grid-cols-2">

          {/* STATUS */}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3"><FieldLabel htmlFor="new-task-status" className="mb-0">Status</FieldLabel><TaskStatusBadge status={status} /></div>

            <select
              id="new-task-status"
              aria-label="Task status"
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target
                    .value as TaskStatus
                )
              }
              className={controlClassName}
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
            <div className="mb-1.5 flex items-center justify-between gap-3"><FieldLabel htmlFor="new-task-priority" className="mb-0">Priority</FieldLabel><TaskPriorityBadge priority={priority} /></div>

            <select
              id="new-task-priority"
              aria-label="Task priority"
              value={priority}
              onChange={(event) =>
                setPriority(
                  event.target
                    .value as TaskPriority
                )
              }
              className={controlClassName}
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

          <FormControl label="Assignee" helperText={loadingEmployees ? "Loading workspace members…" : "The selected employee will receive an assignment notification."}>
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
              onChange={(event) =>
                setDueDate(
                  event.target.value
                )
              }
              className={controlClassName}
            />
          </FormControl>
        </div>

        <CustomFieldProperties workspaceId={workspaceId} values={customFields} onChange={setCustomFields} people={employees} onFieldsLoaded={setCustomDefinitions} canManage={workspaceCanManageProperties || profile?.group === "bod" || profile?.capabilities?.manageWorkspaces === true} />

        {/* ASSIGNMENT INFO */}

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
          <p className="text-sm text-[var(--muted)]">
            {assigneeId
              ? "This task will be assigned to the selected employee."
              : "This task will be created unassigned."}
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div role="status" className="proveit-toast px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ACTIONS */}

        <div className="mt-auto flex justify-end gap-3 border-t border-[var(--border)] pt-5">
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            loading={loading}
            loadingLabel="Creating…"
            disabled={taskCreated}
          >
            {taskCreated ? "Task created" : "Create task"}
          </Button>
        </div>
      </form>
    </div>
  );
}
