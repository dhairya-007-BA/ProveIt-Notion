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
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">
          Loading...
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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold">
            ProveIt
          </h1>

          <p className="mt-2 text-gray-500">
            Create your password
          </p>
        </div>

        {/* EMPLOYEE */}

        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-900">
            {profile.name}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            Employee ID:{" "}
            {profile.employeeId}
          </p>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold">
            Set your new password
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500">
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

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              New password
            </label>

            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-400"
            />
          </div>

          {/* CONFIRM PASSWORD */}

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Confirm new password
            </label>

            <input
              id="confirmPassword"
              type="password"
              required
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
              className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-gray-400"
            />
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SUCCESS */}

          {success && (
            <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : "Set Password"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-gray-400">
          Your password is stored securely
          through Firebase Authentication.
        </p>
      </div>
    </main>
  );
}
