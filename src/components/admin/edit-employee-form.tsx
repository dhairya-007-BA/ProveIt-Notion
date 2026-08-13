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
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold">
          Edit employee
        </h2>

        <p className="mt-1 text-sm text-gray-500">
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
              required
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 outline-none focus:border-gray-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Employee ID
            </label>

            <input
              disabled
              value={employee.employeeId}
              className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-gray-500"
            />

            <p className="mt-1 text-xs text-gray-400">
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
            value={role}
            disabled={editingYourself}
            onChange={(event) =>
              setRole(
                event.target
                  .value as EmployeeRole
              )
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
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
            <p className="mt-2 text-xs text-gray-500">
              You cannot change your own BOD
              role.
            </p>
          )}
        </div>

        {role === "business_intern" && (
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Workspace access:{" "}
            <strong>
              Company + Business
            </strong>
          </div>
        )}

        {role === "tech_intern" && (
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Workspace access:{" "}
            <strong>
              Company + Technology
            </strong>
          </div>
        )}

        {role === "bod" && (
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Workspace access:{" "}
            <strong>
              Company + Business +
              Technology + Board +
              Administration
            </strong>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

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
            disabled={
              loading ||
              !name.trim()
            }
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Saving..."
              : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}