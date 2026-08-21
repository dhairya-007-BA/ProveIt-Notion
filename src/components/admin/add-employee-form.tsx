"use client";

import {
  FormEvent,
  useState,
} from "react";

import { User } from "firebase/auth";

import { authenticatedRequest } from "@/lib/authenticated-request";

type EmployeeRole =
  | "business_intern"
  | "tech_intern"
  | "bod";

interface AddEmployeeFormProps {
  firebaseUser: User;
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
}

export default function AddEmployeeForm({
  firebaseUser,
  onCreated,
  onCancel,
}: AddEmployeeFormProps) {
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] =
    useState("");

  const [role, setRole] =
    useState<EmployeeRole>(
      "business_intern"
    );

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await authenticatedRequest(
        firebaseUser,
        "/api/admin/employees",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({
            name,
            employeeId,
            role,
            password,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Employee could not be created."
        );
      }

      setName("");
      setEmployeeId("");
      setRole("business_intern");
      setPassword("");

      await onCreated();
    } catch (error) {
      console.error(
        "Failed to create employee:",
        error
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Employee could not be created."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="add-employee-heading" className="proveit-card mb-6 p-5 sm:p-6">
      <div>
        <h2 id="add-employee-heading" className="proveit-section-title">
          Add employee
        </h2>

        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a ProveIt account and assign
          initial workspace access.
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
              placeholder="Jane Doe"
              className="proveit-control w-full px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Employee ID
            </label>

            <input
              aria-label="Employee ID"
              required
              value={employeeId}
              onChange={(event) =>
                setEmployeeId(
                  event.target.value
                )
              }
              placeholder="1-002"
              className="proveit-control w-full px-3 py-2.5"
            />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Role
            </label>

            <select
              aria-label="Role"
              value={role}
              onChange={(event) =>
                setRole(
                  event.target
                    .value as EmployeeRole
                )
              }
              className="proveit-control w-full px-3 py-2.5"
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
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Temporary password
            </label>

            <input
              aria-label="Temporary password"
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="Minimum 8 characters"
              className="proveit-control w-full px-3 py-2.5"
            />
          </div>
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
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
            Workspace access:{" "}
            <strong>
              Company + Business + Technology +
              Board + Administration
            </strong>

            <p className="mt-1 text-xs text-[var(--subtle)]">
              BOD members receive privileged
              administrative access.
            </p>
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
            disabled={loading}
            className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : "Create employee"}
          </button>
        </div>
      </form>
    </section>
  );
}
