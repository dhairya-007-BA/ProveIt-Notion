"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  updatePassword,
} from "firebase/auth";

import {
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  useRouter,
} from "next/navigation";

import {
  db,
} from "@/lib/firebase";

import {
  useAuth,
} from "@/components/auth-provider";
import { ProveItLogo } from "@/components/proveit-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormControl, controlClassName } from "@/components/ui/form-control";

export default function ChangePasswordPage() {
  const router =
    useRouter();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
    refreshProfile,
  } = useAuth();

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);

  /*
   * User must be authenticated to
   * access this page.
   */
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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!firebaseUser) {
      setError(
        "You must be signed in to change your password."
      );

      return;
    }

    if (
      password.length < 8
    ) {
      setError(
        "Password must contain at least 8 characters."
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        "Passwords do not match."
      );

      return;
    }

    try {
      setSaving(true);

      /*
       * IMPORTANT:
       *
       * Firebase changes the password
       * for the CURRENTLY AUTHENTICATED
       * employee.
       *
       * The administrator never receives
       * or chooses this password.
       */
      await updatePassword(
        firebaseUser,
        password
      );

      /*
       * Password successfully changed.
       *
       * The employee no longer needs
       * to be forced through password
       * setup.
       */
      const userRef =
        doc(
          db,
          "users",
          firebaseUser.uid
        );

      await updateDoc(
        userRef,
        {
          mustChangePassword:
            false,

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * Refresh AuthProvider so the
       * application immediately sees
       * mustChangePassword = false.
       */
      await refreshProfile();

      setPassword("");
      setConfirmPassword("");

      setSuccess(
        "Your password has been changed successfully."
      );

      /*
       * Small delay so the employee
       * sees confirmation before going
       * to the portal.
       */
      setTimeout(() => {
        router.replace("/");
      }, 800);
    } catch (error) {
      console.error(
        "Failed to change password:",
        error
      );

      if (
        error instanceof Error
      ) {
        /*
         * Firebase can require a fresh
         * login before sensitive account
         * changes.
         */
        if (
          error.message.includes(
            "requires-recent-login"
          )
        ) {
          setError(
            "For security, please sign in again and then change your password."
          );

          return;
        }

        setError(
          error.message
        );
      } else {
        setError(
          "Your password could not be changed."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--text-muted)]">
          Loading ProveIt Workspace…
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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-4 py-10">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(135deg,var(--info-soft),transparent_68%)]" />
      <Card tone="raised" className="relative w-full max-w-md p-7 sm:p-8">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <ProveItLogo className="mx-auto h-auto w-36" priority />
          <h1 className="proveit-heading mt-6 text-2xl font-semibold tracking-[-0.03em]">Secure your account</h1>

          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Create your password
          </p>
        </div>

        {/* EMPLOYEE */}

        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
          <p className="text-sm font-medium text-[var(--text)]">
            {profile.name}
          </p>

          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Employee ID:{" "}
            {profile.employeeId}
          </p>
        </div>

        <div className="mb-6">
          <h2 className="proveit-heading text-base font-semibold">
            Set your new password
          </h2>

          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Choose a private password for
            your ProveIt account. Your
            administrator will not see
            this password.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          {/* PASSWORD */}

          <FormControl id="password" label="New password" required helperText="Use at least 8 characters and keep it private.">
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="At least 8 characters"
              className={controlClassName}
            />
          </FormControl>

          {/* CONFIRM PASSWORD */}

          <FormControl id="confirmPassword" label="Confirm new password" required>
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={
                confirmPassword
              }
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              placeholder="Enter password again"
              className={controlClassName}
            />
          </FormControl>

          {/* ERROR */}

          {error && (
            <div role="alert" className="proveit-feedback proveit-feedback-danger">
              {error}
            </div>
          )}

          {/* SUCCESS */}

          {success && (
            <div role="status" className="proveit-feedback proveit-feedback-success">
              {success}
            </div>
          )}

          {/* SUBMIT */}

          <Button
            type="submit"
            loading={saving}
            loadingLabel="Saving…"
            className="w-full"
          >
            Set password
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-[var(--text-muted)]">
          Your password is stored securely
          through Firebase Authentication.
        </p>
      </Card>
    </main>
  );
}
