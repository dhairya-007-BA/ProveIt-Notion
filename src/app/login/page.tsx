"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  useRouter,
} from "next/navigation";

import {
  auth,
  db,
} from "@/lib/firebase";
import { ProveItLogo } from "@/components/proveit-logo";

function employeeIdToEmail(
  employeeId: string
) {
  return `${employeeId
    .trim()
    .toLowerCase()}@auth.proveit.internal`;
}

export default function LoginPage() {
  const router =
    useRouter();

  const [
    employeeId,
    setEmployeeId,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      /*
       * Convert the employee-facing
       * Employee ID into the internal
       * Firebase Authentication email.
       */
      const email =
        employeeIdToEmail(
          employeeId
        );

      /*
       * Authenticate employee.
       */
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      /*
       * Immediately load the employee's
       * Firestore profile.
       */
      const userRef =
        doc(
          db,
          "users",
          credential.user.uid
        );

      const userSnapshot =
        await getDoc(
          userRef
        );

      /*
       * Firebase Auth account exists,
       * but ProveIt employee profile
       * does not.
       */
      if (
        !userSnapshot.exists()
      ) {
        await signOut(auth);

        setError(
          "Employee profile could not be found."
        );

        return;
      }

      const userData =
        userSnapshot.data();

      /*
       * Prevent inactive employees from
       * entering the portal.
       */
      if (
        userData.active !== true
      ) {
        await signOut(auth);

        setError(
          "Your ProveIt account is inactive. Please contact an administrator."
        );

        return;
      }

      /*
       * PASSWORD RESET / FIRST LOGIN
       *
       * If the administrator has marked
       * this employee as requiring a
       * password change, they are sent
       * directly to the password setup
       * page.
       */
      if (
        userData.mustChangePassword ===
        true
      ) {
        router.replace(
          "/change-password"
        );

        return;
      }

      /*
       * Normal login.
       */
      router.replace("/");
    } catch (error: unknown) {
      console.error(
        "Login failed:",
        error
      );

      /*
       * Do not expose detailed Firebase
       * authentication information to
       * employees.
       */
      setError(
        "Invalid Employee ID or password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfbfa] px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-black/[0.12] bg-white p-8 shadow-[0_12px_40px_rgba(55,53,47,0.08)]">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <ProveItLogo className="mx-auto h-12 w-12" priority />
          <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">ProveIt</h1>

          <p className="mt-1 text-sm text-[#787774]">Sign in to your workspace</p>
        </div>

        {/* LOGIN FORM */}

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          {/* EMPLOYEE ID */}

          <div>
            <label
              htmlFor="employeeId"
              className="mb-1.5 block text-sm font-medium text-[#37352f]"
            >
              Employee ID
            </label>

            <input
              id="employeeId"
              type="text"
              required
              autoComplete="username"
              value={employeeId}
              onChange={(event) =>
                setEmployeeId(
                  event.target.value
                )
              }
              placeholder="Enter your employee ID"
              className="w-full rounded-md border border-black/[0.15] px-3 py-2.5 text-sm outline-none transition focus:border-[#787774] focus:ring-2 focus:ring-black/[0.06]"
            />
          </div>

          {/* PASSWORD */}

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-[#37352f]"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              className="w-full rounded-md border border-black/[0.15] px-3 py-2.5 text-sm outline-none transition focus:border-[#787774] focus:ring-2 focus:ring-black/[0.06]"
            />
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SIGN IN */}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#252525] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Signing in..."
              : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[#9b9a97]">
          ProveIt Hiring Innovations
        </p>
      </div>
    </main>
  );
}
