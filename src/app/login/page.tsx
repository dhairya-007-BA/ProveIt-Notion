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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormControl, controlClassName } from "@/components/ui/form-control";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-4 py-10">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(135deg,var(--info-soft),transparent_68%)]" />
      <Card tone="raised" className="relative w-full max-w-sm p-7 sm:p-8">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <ProveItLogo className="mx-auto h-auto w-36" priority />
          <h1 className="proveit-heading mt-6 text-2xl font-semibold tracking-[-0.03em]">Welcome back</h1>

          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Sign in to ProveIt Workspace</p>
        </div>

        {/* LOGIN FORM */}

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          {/* EMPLOYEE ID */}

          <FormControl id="employeeId" label="Employee ID" required>
            <input
              type="text"
              autoComplete="username"
              value={employeeId}
              onChange={(event) =>
                setEmployeeId(
                  event.target.value
                )
              }
              placeholder="Enter your employee ID"
              className={controlClassName}
            />
          </FormControl>

          {/* PASSWORD */}

          <FormControl id="password" label="Password" required>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              className={controlClassName}
            />
          </FormControl>

          {/* ERROR */}

          {error && (
            <div role="alert" className="proveit-feedback proveit-feedback-danger">
              {error}
            </div>
          )}

          {/* SIGN IN */}

          <Button
            type="submit"
            loading={loading}
            loadingLabel="Signing in…"
            className="w-full"
          >
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          ProveIt Hiring Innovations
        </p>
      </Card>
    </main>
  );
}
