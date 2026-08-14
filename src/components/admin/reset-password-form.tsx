"use client";

import {
  useState,
} from "react";

import {
  User,
} from "firebase/auth";

import {
  ProveItUser,
} from "@/types/user";

import { authenticatedRequest } from "@/lib/authenticated-request";

interface ResetPasswordFormProps {
  employee: ProveItUser;
  currentUser: User;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ResetPasswordForm({
  employee,
  currentUser,
  onSaved,
  onCancel,
}: ResetPasswordFormProps) {
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    temporaryPassword,
    setTemporaryPassword,
  ] = useState("");

  const [
    copied,
    setCopied,
  ] = useState(false);

  async function handleReset() {
    try {
      setLoading(true);
      setError("");
      setCopied(false);

      const response = await authenticatedRequest(
        currentUser,
        `/api/admin/employees/${employee.uid}/password`,
        {
          method: "PATCH",

        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Password could not be reset."
        );
      }

      if (
        !result.temporaryPassword
      ) {
        throw new Error(
          "Temporary password was not returned."
        );
      }

      setTemporaryPassword(
        result.temporaryPassword
      );
    } catch (error) {
      console.error(
        "Failed to reset employee password:",
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
          "Password could not be reset."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(
        temporaryPassword
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(
        "Failed to copy temporary password:",
        error
      );

      setError(
        "Could not copy the temporary password. Please copy it manually."
      );
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      {!temporaryPassword ? (
        <>
          {/* HEADER */}

          <div>
            <h2 className="text-lg font-semibold">
              Reset password
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Generate a temporary password
              for{" "}
              <strong>
                {employee.name}
              </strong>
              .
            </p>
          </div>

          {/* EXPLANATION */}

          <div className="mt-6 rounded-lg bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
            A temporary password will be
            generated automatically. Give
            it securely to the employee.
            After signing in, they will be
            required to create their own
            private password.
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ACTIONS */}

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
              type="button"
              disabled={loading}
              onClick={handleReset}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Generating..."
                : "Generate temporary password"}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* SUCCESS */}

          <div>
            <h2 className="text-lg font-semibold">
              Temporary password generated
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Give this password securely
              to{" "}
              <strong>
                {employee.name}
              </strong>
              .
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-green-700">
              Temporary password
            </p>

            <div className="mt-3 flex items-center gap-3">
              <code className="flex-1 break-all rounded-lg border border-green-200 bg-white px-4 py-3 text-base font-semibold text-gray-900">
                {temporaryPassword}
              </code>

              <button
                type="button"
                onClick={copyPassword}
                className="rounded-lg border border-green-200 bg-white px-4 py-3 text-sm font-medium text-green-800 hover:bg-green-100"
              >
                {copied
                  ? "Copied!"
                  : "Copy"}
              </button>
            </div>
          </div>

          {/* WARNING */}

          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
            Save or share this temporary
            password now. It is not stored
            in Firestore and will not be
            shown again after you close
            this screen.
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-4 text-sm leading-6 text-gray-600">
            The employee will sign in using
            their Employee ID and this
            temporary password. ProveIt will
            then require them to create
            their own private password.
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* DONE */}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onSaved}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
