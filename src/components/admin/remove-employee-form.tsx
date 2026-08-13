"use client";

import {
  FormEvent,
  useState,
} from "react";

import { User } from "firebase/auth";
import { ProveItUser } from "@/types/user";

interface RemoveEmployeeFormProps {
  employee: ProveItUser;
  currentUser: User;
  onRemoved: () => Promise<void> | void;
  onCancel: () => void;
}

export default function RemoveEmployeeForm({
  employee,
  currentUser,
  onRemoved,
  onCancel,
}: RemoveEmployeeFormProps) {
  const [confirmation, setConfirmation] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const matches =
    confirmation
      .trim()
      .toLowerCase() ===
    employee.employeeId
      .trim()
      .toLowerCase();

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!matches) {
      setError(
        "Employee ID confirmation does not match."
      );

      return;
    }

    try {
      setLoading(true);
      setError("");

      const idToken =
        await currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/employees/${employee.uid}/remove`,
        {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${idToken}`,
          },

          body: JSON.stringify({
            employeeId:
              confirmation.trim(),
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Employee could not be removed."
        );
      }

      await onRemoved();
    } catch (error) {
      console.error(
        "Failed to remove employee:",
        error
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Employee could not be removed."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-white p-6">
      <div>
        <p className="text-sm font-medium text-red-600">
          Permanent removal
        </p>

        <h2 className="mt-1 text-lg font-semibold">
          Remove {employee.name}
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          This will permanently remove the
          employee&apos;s login access and
          active workspace memberships.
          Historical company records associated
          with this employee will be preserved.
        </p>
      </div>

      <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
        <strong>
          This action cannot restore the existing
          authentication account.
        </strong>{" "}
        If this person returns to ProveIt later,
        a new authentication account would need
        to be provisioned.
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6"
      >
        <label className="block text-sm font-medium text-gray-700">
          Type{" "}
          <span className="font-semibold">
            {employee.employeeId}
          </span>{" "}
          to confirm removal.
        </label>

        <input
          required
          value={confirmation}
          onChange={(event) =>
            setConfirmation(
              event.target.value
            )
          }
          placeholder={
            employee.employeeId
          }
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2.5 outline-none focus:border-red-400"
        />

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
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
              !matches
            }
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? "Removing..."
              : "Remove employee permanently"}
          </button>
        </div>
      </form>
    </div>
  );
}