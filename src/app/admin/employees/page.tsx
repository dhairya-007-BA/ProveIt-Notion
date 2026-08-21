"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AddEmployeeForm from "@/components/admin/add-employee-form";
import EditEmployeeForm from "@/components/admin/edit-employee-form";
import EmployeeActions from "@/components/admin/employee-actions";
import ResetPasswordForm from "@/components/admin/reset-password-form";
import RemoveEmployeeForm from "@/components/admin/remove-employee-form";
import AccessPermissions from "@/components/admin/access-permissions";
import { useAuth } from "@/components/auth-provider";
import { BackButton } from "@/components/back-button";
import Sidebar from "@/components/sidebar";

import { getUsers } from "@/lib/users";
import { ProveItUser } from "@/types/user";

export default function EmployeeAdminPage() {
  const router = useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
  } = useAuth();

  const [users, setUsers] =
    useState<ProveItUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [
    addingEmployee,
    setAddingEmployee,
  ] = useState(false);

  const [
    editingEmployee,
    setEditingEmployee,
  ] = useState<ProveItUser | null>(null);

  const [
    resettingPasswordFor,
    setResettingPasswordFor,
  ] = useState<ProveItUser | null>(null);

  const [
    removingEmployee,
    setRemovingEmployee,
  ] = useState<ProveItUser | null>(null);

  async function loadUsers() {
    try {
      setLoading(true);
      setLoadError("");

      const data = await getUsers();

      setUsers(data);
    } catch (error) {
      console.error(
        "Failed to load employees:",
        error
      );
      setLoadError("Employees could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      !authLoading &&
      !firebaseUser
    ) {
      router.replace("/login");
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
      profile.group !== "bod"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    authLoading,
    firebaseUser,
    profile,
  ]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">
          Loading...
        </p>
      </main>
    );
  }

  if (!firebaseUser || !profile) {
    return null;
  }

  if (profile.group !== "bod") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-5">
        <div className="proveit-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Employee administration is
            restricted to BOD members.
          </p>
        </div>

      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[var(--background)]"><Sidebar />
      <section className="proveit-content"><div className="mx-auto max-w-5xl">

        <BackButton href="/" label="Home" />

        {/* HEADER */}

        <div className="proveit-page-header mb-8">
          <div>
            <p className="proveit-label mb-2">
              Administration
            </p>

            <h1 className="proveit-page-title">
              Employees
            </h1>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Manage ProveIt employees,
              roles and workspace access.
            </p>
          </div>

          <button
            onClick={() => {
              setEditingEmployee(null);
              setResettingPasswordFor(null);
              setRemovingEmployee(null);
              setAddingEmployee(true);
            }}
            disabled={addingEmployee}
            className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add employee
          </button>
        </div>

        {/* ADD EMPLOYEE */}

        {addingEmployee && (
          <AddEmployeeForm
            firebaseUser={firebaseUser}
            onCancel={() =>
              setAddingEmployee(false)
            }
            onCreated={async () => {
              setAddingEmployee(false);

              await loadUsers();
            }}
          />
        )}

        {/* EDIT EMPLOYEE */}

        {editingEmployee && (
          <>
          <EditEmployeeForm
            employee={editingEmployee}
            currentUser={firebaseUser}
            onCancel={() =>
              setEditingEmployee(null)
            }
            onSaved={async () => {
              setEditingEmployee(null);

              await loadUsers();
            }}
          />
          <div className="mt-6"><AccessPermissions uid={editingEmployee.uid} /></div>
          </>
        )}

        {/* RESET PASSWORD */}

        {resettingPasswordFor && (
          <ResetPasswordForm
            employee={resettingPasswordFor}
            currentUser={firebaseUser}
            onCancel={() =>
              setResettingPasswordFor(null)
            }
            onSaved={() => {
              setResettingPasswordFor(null);
            }}
          />
        )}

        {/* REMOVE EMPLOYEE */}

        {removingEmployee && (
          <RemoveEmployeeForm
            employee={removingEmployee}
            currentUser={firebaseUser}
            onCancel={() =>
              setRemovingEmployee(null)
            }
            onRemoved={async () => {
              setRemovingEmployee(null);

              await loadUsers();
            }}
          />
        )}

        {/* EMPLOYEE LIST */}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full max-w-md"><label className="sr-only" htmlFor="employee-search">Search employees</label><input id="employee-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, Employee ID, or email…" className="proveit-control w-full px-3 py-2 text-sm" /></div>
          <p className="text-xs text-[var(--muted)]">{users.length} employee{users.length === 1 ? "" : "s"}</p>
        </div>
        {loadError && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--danger)]"><span>{loadError}</span><button type="button" onClick={() => void loadUsers()} className="proveit-secondary-button">Retry</button></div>}
        <div className="proveit-card overflow-visible">
          {loading ? (
            <div className="p-6 text-sm text-[var(--muted)]">
              Loading employees...
            </div>
          ) : users.filter((user) => `${user.name} ${user.employeeId} ${user.email || ""}`.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())).length === 0 ? (
            <div className="p-10 text-center"><p className="font-medium">{searchQuery.trim() ? "No matching employees" : "No employees found"}</p><p className="mt-2 text-sm text-[var(--muted)]">{searchQuery.trim() ? "Try another name, Employee ID, or email." : "Create an employee account to get started."}</p></div>
          ) : (
            users.filter((user) => `${user.name} ${user.employeeId} ${user.email || ""}`.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())).map((user) => (
              <div
                key={user.uid}
                className="flex flex-col gap-4 border-b border-[var(--border)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5"
              >
                {/* EMPLOYEE */}

                <div className="flex items-center gap-4">
                  <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--selected)] font-medium text-[var(--secondary)]">
                    {user.name
                      ?.split(" ")
                      .map(
                        (part) =>
                          part[0]
                      )
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div>
                    <p className="font-medium">
                      {user.name}
                    </p>

                    <p className="mt-1 text-xs text-[var(--subtle)]">
                      Employee ID:{" "}
                      {user.employeeId}
                    </p>
                  </div>
                </div>

                {/* ROLE + STATUS + ACTIONS */}

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs capitalize text-[var(--muted)]">
                    {user.group.replaceAll(
                      "_",
                      " "
                    )}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      user.active
                        ? "bg-[var(--status-success-bg)] text-[var(--success)]"
                        : "bg-[var(--surface-muted)] text-[var(--muted)]"
                    }`}
                  >
                    {user.active
                      ? "Active"
                      : "Deactivated"}
                  </span>

                  <EmployeeActions
                    employee={user}
                    currentUser={firebaseUser}
                    onChanged={loadUsers}

                    onEdit={(employee) => {
                      setAddingEmployee(false);
                      setResettingPasswordFor(
                        null
                      );
                      setRemovingEmployee(null);

                      setEditingEmployee(
                        employee
                      );
                    }}

                    onResetPassword={(
                      employee
                    ) => {
                      setAddingEmployee(false);
                      setEditingEmployee(null);
                      setRemovingEmployee(null);

                      setResettingPasswordFor(
                        employee
                      );
                    }}

                    onRemove={(employee) => {
                      setAddingEmployee(false);
                      setEditingEmployee(null);
                      setResettingPasswordFor(
                        null
                      );

                      setRemovingEmployee(
                        employee
                      );
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* ADMIN NOTE */}

        <div className="proveit-card mt-6 p-5">
          <p className="text-sm font-medium text-[var(--foreground)]">
            Employee lifecycle
          </p>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Deactivated employees retain
            their historical records but
            cannot access the ProveIt
            workspace. Permanent removal
            deletes the employee&apos;s
            authentication account and
            workspace access while preserving
            historical company records.
          </p>
        </div>
      </div></section>
    </main>
  );
}
