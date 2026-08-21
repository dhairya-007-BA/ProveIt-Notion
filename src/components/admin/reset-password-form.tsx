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
    <section aria-labelledby="reset-password-heading" className="proveit-card mb-6 p-5 sm:p-6">
      {!temporaryPassword ? (
        <>
          {/* HEADER */}

          <div>
            <h2 id="reset-password-heading" className="proveit-section-title">
              Reset password
            </h2>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Generate a temporary password
              for{" "}
              <strong>
                {employee.name}
              </strong>
              .
            </p>
          </div>

          {/* EXPLANATION */}

          <div className="mt-6 rounded-lg bg-[var(--status-warning-bg)] px-4 py-4 text-sm leading-6 text-[var(--warning)]">
            A temporary password will be
            generated automatically. Give
            it securely to the employee.
            After signing in, they will be
            required to create their own
            private password.
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-lg bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* ACTIONS */}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="proveit-secondary-button disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleReset}
              className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50"
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
            <h2 id="reset-password-heading" className="proveit-section-title">
              Temporary password generated
            </h2>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Give this password securely
              to{" "}
              <strong>
                {employee.name}
              </strong>
              .
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-[var(--success)]/30 bg-[var(--status-success-bg)] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--success)]">
              Temporary password
            </p>

            <div className="mt-3 flex items-center gap-3">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-[var(--success)]/30 bg-[var(--surface)] px-4 py-3 text-base font-semibold text-[var(--foreground)]">
                {temporaryPassword}
              </code>

              <button
                type="button"
                onClick={copyPassword}
                className="proveit-secondary-button"
              >
                {copied
                  ? "Copied!"
                  : "Copy"}
              </button>
            </div>
          </div>

          {/* WARNING */}

          <div className="mt-4 rounded-lg bg-[var(--status-warning-bg)] px-4 py-4 text-sm leading-6 text-[var(--warning)]">
            Save or share this temporary
            password now. It is not stored
            in Firestore and will not be
            shown again after you close
            this screen.
          </div>

          <div className="mt-4 rounded-lg bg-[var(--surface-muted)] px-4 py-4 text-sm leading-6 text-[var(--muted)]">
            The employee will sign in using
            their Employee ID and this
            temporary password. ProveIt will
            then require them to create
            their own private password.
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-lg bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* DONE */}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onSaved}
              className="proveit-primary-button"
            >
              Done
            </button>
          </div>
        </>
      )}
    </section>
  );
}
