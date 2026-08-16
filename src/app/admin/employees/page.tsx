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

      const data = await getUsers();

      setUsers(data);
    } catch (error) {
      console.error(
        "Failed to load employees:",
        error
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
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
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
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl border bg-white p-8 text-center">
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Employee administration is
            restricted to BOD members.
          </p>
        </div>

        <label className="sr-only" htmlFor="employee-search">Search employees</label>
        <input id="employee-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search employees…" className="proveit-control mb-5 w-full max-w-md px-3 py-2 text-sm" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <div className="mx-auto max-w-5xl">

        <BackButton href="/" label="Home" />

        {/* HEADER */}

        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-500">
              Administration
            </p>

            <h1 className="text-3xl font-semibold tracking-tight">
              Employees
            </h1>

            <p className="mt-2 text-sm text-gray-500">
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
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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

        <div className="overflow-visible rounded-xl border border-gray-200 bg-white">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">
              Loading employees...
            </div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No employees found.
            </div>
          ) : (
            users.filter((user) => `${user.name} ${user.employeeId} ${user.email || ""}`.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())).map((user) => (
              <div
                key={user.uid}
                className="flex items-center justify-between border-b border-gray-100 px-6 py-5 last:border-b-0"
              >
                {/* EMPLOYEE */}

                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 font-medium">
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

                    <p className="mt-1 text-xs text-gray-400">
                      Employee ID:{" "}
                      {user.employeeId}
                    </p>
                  </div>
                </div>

                {/* ROLE + STATUS + ACTIONS */}

                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs capitalize text-gray-600">
                    {user.group.replaceAll(
                      "_",
                      " "
                    )}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      user.active
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-500"
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

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-700">
            Employee lifecycle
          </p>

          <p className="mt-1 text-sm leading-6 text-gray-500">
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
      </div>
    </main>
  );
}
