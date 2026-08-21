"use client";

import {
  FormEvent,
  useState,
} from "react";

import { User } from "firebase/auth";

import { ProveItUser } from "@/types/user";

type EmployeeRole =
  | "business_intern"
  | "tech_intern"
  | "bod";

interface EditEmployeeFormProps {
  employee: ProveItUser;
  currentUser: User;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}

export default function EditEmployeeForm({
  employee,
  currentUser,
  onSaved,
  onCancel,
}: EditEmployeeFormProps) {
  const [name, setName] =
    useState(employee.name);

  const [role, setRole] =
    useState<EmployeeRole>(
      employee.group as EmployeeRole
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const editingYourself =
    employee.uid === currentUser.uid;

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const idToken =
        await currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/employees/${employee.uid}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${idToken}`,
          },

          body: JSON.stringify({
            name,
            role,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Employee could not be updated."
        );
      }

      await onSaved();
    } catch (error) {
      console.error(
        "Failed to update employee:",
        error
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Employee could not be updated."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="edit-employee-heading" className="proveit-card mb-6 p-5 sm:p-6">
      <div>
        <h2 id="edit-employee-heading" className="proveit-section-title">
          Edit employee
        </h2>

        <p className="mt-1 text-sm text-[var(--muted)]">
          Update employee information and
          workspace access.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Full name
            </label>

            <input
              aria-label="Full name"
              required
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              className="proveit-control w-full px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Employee ID
            </label>

            <input
              aria-label="Employee ID"
              disabled
              value={employee.employeeId}
              className="proveit-control w-full cursor-not-allowed bg-[var(--surface-muted)] px-3 py-2.5 text-[var(--muted)]"
            />

            <p className="mt-1 text-xs text-[var(--subtle)]">
              Employee IDs cannot currently
              be changed.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Role
          </label>

          <select
            aria-label="Role"
            value={role}
            disabled={editingYourself}
            onChange={(event) =>
              setRole(
                event.target
                  .value as EmployeeRole
              )
            }
            className="proveit-control w-full px-3 py-2.5 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]"
          >
            <option value="business_intern">
              Business Intern
            </option>

            <option value="tech_intern">
              Technology Intern
            </option>

            <option value="bod">
              Board of Directors
            </option>
          </select>

          {editingYourself && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              You cannot change your own BOD
              role.
            </p>
          )}
        </div>

        {role === "business_intern" && (
          <div className="rounded-lg bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
            Workspace access:{" "}
            <strong>
              Company + Business
            </strong>
          </div>
        )}

        {role === "tech_intern" && (
          <div className="rounded-lg bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
            Workspace access:{" "}
            <strong>
              Company + Technology
            </strong>
          </div>
        )}

        {role === "bod" && (
          <div className="rounded-lg bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
            Workspace access:{" "}
            <strong>
              Company + Business +
              Technology + Board +
              Administration
            </strong>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="proveit-secondary-button disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              loading ||
              !name.trim()
            }
            className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Saving..."
              : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
