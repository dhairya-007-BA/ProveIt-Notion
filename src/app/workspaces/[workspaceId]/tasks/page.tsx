"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import Sidebar from "@/components/sidebar";
import NewTaskForm from "@/components/tasks/new-task-form";

import EditTaskForm, {
  EditableTask,
  EditableTaskPriority,
  EditableTaskStatus,
} from "@/components/tasks/edit-task-form";

import { useAuth } from "@/components/auth-provider";

import { db } from "@/lib/firebase";
import { getUsers } from "@/lib/users";

import { ProveItUser } from "@/types/user";

type WorkspaceTask =
  EditableTask;

export default function TasksPage() {
  const params =
    useParams<{
      workspaceId: string;
    }>();

  const router =
    useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
  } = useAuth();

  const workspaceId =
    params.workspaceId;

  const [tasks, setTasks] =
    useState<WorkspaceTask[]>([]);

  const [users, setUsers] =
    useState<ProveItUser[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    creatingTask,
    setCreatingTask,
  ] = useState(false);

  const [
    selectedTask,
    setSelectedTask,
  ] =
    useState<WorkspaceTask | null>(
      null
    );

  async function loadTasks() {
    if (
      !firebaseUser ||
      !profile ||
      !workspaceId
    ) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const tasksQuery =
        query(
          collection(
            db,
            "tasks"
          ),
          where(
            "workspaceId",
            "==",
            workspaceId
          )
        );

      const [
        snapshot,
        userData,
      ] = await Promise.all([
        getDocs(tasksQuery),
        getUsers(),
      ]);

      const results =
        snapshot.docs.map(
          (taskSnapshot) => {
            const data =
              taskSnapshot.data();

            return {
              id:
                taskSnapshot.id,

              title:
                data.title ||
                "Untitled task",

              description:
                data.description ||
                "",

              workspaceId:
                data.workspaceId,

              status:
                (data.status ||
                  "todo") as EditableTaskStatus,

              priority:
                (data.priority ||
                  "medium") as EditableTaskPriority,

              assigneeId:
                data.assigneeId ||
                null,

              dueDate:
                data.dueDate
                  ?.toDate(),

              createdBy:
                data.createdBy ||
                "",

              createdAt:
                data.createdAt
                  ?.toDate(),

              updatedAt:
                data.updatedAt
                  ?.toDate(),
            } as WorkspaceTask;
          }
        );

      setTasks(results);
      setUsers(userData);

      /*
       * If a task is currently open
       * in the editor, refresh its
       * local version too.
       */
      setSelectedTask(
        (currentTask) => {
          if (!currentTask) {
            return null;
          }

          return (
            results.find(
              (task) =>
                task.id ===
                currentTask.id
            ) || null
          );
        }
      );
    } catch (error) {
      console.error(
        "Failed to load tasks:",
        error
      );

      setError(
        "Tasks could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      !authLoading &&
      !firebaseUser
    ) {
      router.replace(
        "/login"
      );
    }
  }, [
    authLoading,
    firebaseUser,
    router,
  ]);

  useEffect(() => {
    if (
      authLoading ||
      !firebaseUser ||
      !profile ||
      !workspaceId
    ) {
      return;
    }

    loadTasks();
  }, [
    authLoading,
    firebaseUser,
    profile,
    workspaceId,
  ]);

  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Loading tasks...
        </p>
      </main>
    );
  }

  if (
    !firebaseUser ||
    !profile
  ) {
    return null;
  }

  const todoTasks =
    tasks.filter(
      (task) =>
        task.status === "todo"
    );

  const inProgressTasks =
    tasks.filter(
      (task) =>
        task.status ===
        "in_progress"
    );

  const blockedTasks =
    tasks.filter(
      (task) =>
        task.status ===
        "blocked"
    );

  const doneTasks =
    tasks.filter(
      (task) =>
        task.status === "done"
    );

  function openTask(
    task: WorkspaceTask
  ) {
    setCreatingTask(false);
    setSelectedTask(task);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function getAssigneeName(
    assigneeId?: string | null
  ) {
    if (!assigneeId) {
      return null;
    }

    const user =
      users.find(
        (candidate) =>
          candidate.uid ===
          assigneeId
      );

    return (
      user?.name ||
      "Unknown employee"
    );
  }

  return (
    <main className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <section className="min-w-0 flex-1 p-10">
        <div className="mx-auto max-w-7xl">

          {/* BACK */}

          <div className="mb-8">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to workspace
            </Link>
          </div>

          {/* HEADER */}

          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-400">
                Workspace
              </p>

              <h1 className="text-3xl font-semibold tracking-tight">
                Tasks
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                Track work,
                ownership,
                priorities and
                deadlines.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedTask(
                  null
                );

                setCreatingTask(
                  true
                );
              }}
              disabled={
                creatingTask
              }
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + New task
            </button>
          </div>

          {/* NEW TASK */}

          {creatingTask && (
            <NewTaskForm
              workspaceId={
                workspaceId
              }
              currentUser={
                firebaseUser
              }
              onCancel={() =>
                setCreatingTask(
                  false
                )
              }
              onCreated={async () => {
                setCreatingTask(
                  false
                );

                await loadTasks();
              }}
            />
          )}

          {/* EDIT TASK */}

          {selectedTask && (
            <EditTaskForm
              key={
                selectedTask.id
              }
              task={
                selectedTask
              }
              onCancel={() =>
                setSelectedTask(
                  null
                )
              }
              onSaved={async () => {
                setSelectedTask(
                  null
                );

                await loadTasks();
              }}
              onDeleted={async () => {
                setSelectedTask(
                  null
                );

                await loadTasks();
              }}
            />
          )}

          {/* ERROR */}

          {error && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SUMMARY */}

          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="To do"
              count={
                todoTasks.length
              }
            />

            <SummaryCard
              label="In progress"
              count={
                inProgressTasks.length
              }
            />

            <SummaryCard
              label="Blocked"
              count={
                blockedTasks.length
              }
            />

            <SummaryCard
              label="Done"
              count={
                doneTasks.length
              }
            />
          </div>

          {/* BOARD */}

          <div className="grid gap-5 xl:grid-cols-4">
            <TaskColumn
              title="To do"
              tasks={todoTasks}
              getAssigneeName={
                getAssigneeName
              }
              onTaskClick={
                openTask
              }
            />

            <TaskColumn
              title="In progress"
              tasks={
                inProgressTasks
              }
              getAssigneeName={
                getAssigneeName
              }
              onTaskClick={
                openTask
              }
            />

            <TaskColumn
              title="Blocked"
              tasks={
                blockedTasks
              }
              getAssigneeName={
                getAssigneeName
              }
              onTaskClick={
                openTask
              }
            />

            <TaskColumn
              title="Done"
              tasks={doneTasks}
              getAssigneeName={
                getAssigneeName
              }
              onTaskClick={
                openTask
              }
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold">
        {count}
      </p>
    </div>
  );
}

function TaskColumn({
  title,
  tasks,
  getAssigneeName,
  onTaskClick,
}: {
  title: string;

  tasks: WorkspaceTask[];

  getAssigneeName: (
    assigneeId?: string | null
  ) => string | null;

  onTaskClick: (
    task: WorkspaceTask
  ) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          {title}
        </h2>

        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
          {tasks.length}
        </span>
      </div>

      <div className="min-h-48 rounded-xl bg-gray-100 p-3">
        {tasks.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 p-5 text-center text-xs text-gray-400">
            No tasks
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(
              (task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assigneeName={
                    getAssigneeName(
                      task.assigneeId
                    )
                  }
                  onClick={() =>
                    onTaskClick(
                      task
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  assigneeName,
  onClick,
}: {
  task: WorkspaceTask;

  assigneeName:
    string | null;

  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-5 text-gray-900">
          {task.title}
        </p>

        <PriorityBadge
          priority={
            task.priority
          }
        />
      </div>

      {task.description && (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500">
          {task.description}
        </p>
      )}

      <div className="mt-4 space-y-1">
        {assigneeName && (
          <p className="text-xs font-medium text-gray-600">
            {assigneeName}
          </p>
        )}

        {task.dueDate && (
          <p className="text-xs text-gray-400">
            Due{" "}
            {task.dueDate.toLocaleDateString()}
          </p>
        )}

        {!assigneeName &&
          !task.dueDate && (
            <p className="text-xs text-gray-400">
              Unassigned
            </p>
          )}
      </div>
    </button>
  );
}

function PriorityBadge({
  priority,
}: {
  priority:
    EditableTaskPriority;
}) {
  const styles: Record<
    EditableTaskPriority,
    string
  > = {
    low:
      "bg-gray-100 text-gray-600",

    medium:
      "bg-blue-50 text-blue-700",

    high:
      "bg-amber-50 text-amber-700",

    urgent:
      "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium capitalize ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}
