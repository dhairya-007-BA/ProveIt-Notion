"use client";

import { useState } from "react";
import { User } from "firebase/auth";

import { ProveItUser } from "@/types/user";

interface EmployeeActionsProps {
  employee: ProveItUser;
  currentUser: User;

  onChanged: () => Promise<void> | void;

  onEdit: (
    employee: ProveItUser
  ) => void;

  onResetPassword: (
    employee: ProveItUser
  ) => void;

  onRemove: (
    employee: ProveItUser
  ) => void;
}

export default function EmployeeActions({
  employee,
  currentUser,
  onChanged,
  onEdit,
  onResetPassword,
  onRemove,
}: EmployeeActionsProps) {
  const [open, setOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const isCurrentUser =
    employee.uid === currentUser.uid;

  async function changeStatus(
    active: boolean
  ) {
    if (
      !active &&
      !window.confirm(
        `Deactivate ${employee.name}? They will no longer be able to access ProveIt.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const idToken =
        await currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/employees/${employee.uid}/status`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${idToken}`,
          },

          body: JSON.stringify({
            active,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Employee status could not be changed."
        );
      }

      setOpen(false);

      await onChanged();
    } catch (error) {
      console.error(
        "Failed to change employee status:",
        error
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Employee status could not be changed."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleEdit() {
    setOpen(false);
    setError("");

    onEdit(employee);
  }

  function handleResetPassword() {
    setOpen(false);
    setError("");

    onResetPassword(employee);
  }

  function handleRemove() {
    if (isCurrentUser) {
      return;
    }

    setOpen(false);
    setError("");

    onRemove(employee);
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={loading}
        onClick={() =>
          setOpen(
            (current) => !current
          )
        }
        className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
        aria-label={`Actions for ${employee.name}`}
      >
        •••
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">

          {/* EDIT */}

          <button
            type="button"
            onClick={handleEdit}
            className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit employee
          </button>

          {/* PASSWORD */}

          <button
            type="button"
            onClick={handleResetPassword}
            className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Reset password
          </button>

          <div className="my-1 border-t border-gray-100" />

          {/* STATUS */}

          {employee.active ? (
            <button
              type="button"
              disabled={
                loading ||
                isCurrentUser
              }
              onClick={() =>
                changeStatus(false)
              }
              className="block w-full px-4 py-2.5 text-left text-sm text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white"
            >
              {isCurrentUser
                ? "Cannot deactivate yourself"
                : "Deactivate employee"}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                changeStatus(true)
              }
              className="block w-full px-4 py-2.5 text-left text-sm text-green-700 hover:bg-green-50 disabled:opacity-40"
            >
              Reactivate employee
            </button>
          )}

          <div className="my-1 border-t border-gray-100" />

          {/* PERMANENT REMOVAL */}

          <button
            type="button"
            disabled={
              loading ||
              isCurrentUser
            }
            onClick={handleRemove}
            className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white"
          >
            {isCurrentUser
              ? "Cannot remove yourself"
              : "Remove permanently"}
          </button>
        </div>
      )}

      {error && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      )}
    </div>
  );
}