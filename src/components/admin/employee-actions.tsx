"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";

import { ProveItUser } from "@/types/user";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus();
    const outside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  function closeMenu() { setOpen(false); window.setTimeout(() => triggerRef.current?.focus(), 0); }

  function menuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); buttons[(index + 1) % buttons.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length]?.focus(); }
  }

  const isCurrentUser =
    employee.uid === currentUser.uid;

  async function changeStatus(
    active: boolean
  ) {
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
      setConfirmingDeactivation(false);

      await onChanged();
    } catch (error) {
      console.error(
        "Failed to change employee status:",
        error
      );

      setError("Employee status could not be changed.");
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
        ref={triggerRef}
        type="button"
        disabled={loading}
        onClick={() =>
          setOpen(
            (current) => !current
          )
        }
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-40"
        aria-label={`Actions for ${employee.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        •••
      </button>

      {open && (
        <div ref={menuRef} role="menu" aria-label={`Actions for ${employee.name}`} onKeyDown={menuKeyDown} className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-1 shadow-[var(--shadow-md)]">

          {/* EDIT */}

          <button
            role="menuitem"
            type="button"
            onClick={handleEdit}
            className="block w-full px-4 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--hover)] focus:bg-[var(--hover)] focus:outline-none"
          >
            Edit employee
          </button>

          {/* PASSWORD */}

          <button
            role="menuitem"
            type="button"
            onClick={handleResetPassword}
            className="block w-full px-4 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--hover)] focus:bg-[var(--hover)] focus:outline-none"
          >
            Reset password
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          {/* STATUS */}

          {employee.active ? (
            <button
              role="menuitem"
              type="button"
              disabled={
                loading ||
                isCurrentUser
              }
              onClick={() => setConfirmingDeactivation(true)}
              className="block w-full px-4 py-2.5 text-left text-sm text-[var(--warning)] hover:bg-[var(--status-warning-bg)] focus:bg-[var(--status-warning-bg)] focus:outline-none disabled:cursor-not-allowed disabled:text-[var(--subtle)] disabled:hover:bg-transparent"
            >
              {isCurrentUser
                ? "Cannot deactivate yourself"
                : "Deactivate employee"}
            </button>
          ) : (
            <button
              role="menuitem"
              type="button"
              disabled={loading}
              onClick={() =>
                changeStatus(true)
              }
              className="block w-full px-4 py-2.5 text-left text-sm text-[var(--success)] hover:bg-[var(--status-success-bg)] focus:bg-[var(--status-success-bg)] focus:outline-none disabled:opacity-40"
            >
              Reactivate employee
            </button>
          )}

          <div className="my-1 border-t border-[var(--border)]" />

          {/* PERMANENT REMOVAL */}

          <button
            role="menuitem"
            type="button"
            disabled={
              loading ||
              isCurrentUser
            }
            onClick={handleRemove}
            className="block w-full px-4 py-2.5 text-left text-sm text-[var(--danger)] hover:bg-[var(--status-danger-bg)] focus:bg-[var(--status-danger-bg)] focus:outline-none disabled:cursor-not-allowed disabled:text-[var(--subtle)] disabled:hover:bg-transparent"
          >
            {isCurrentUser
              ? "Cannot remove yourself"
              : "Remove permanently"}
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] p-3 text-xs text-[var(--danger)] shadow-[var(--shadow-sm)]">
          {error}
        </div>
      )}
      <ConfirmDialog open={confirmingDeactivation} title="Deactivate employee?" description={`${employee.name} will no longer be able to access ProveIt. You can reactivate this employee later.`} confirmLabel="Deactivate employee" loading={loading} error={error} onCancel={() => { if (!loading) { setConfirmingDeactivation(false); setError(""); } }} onConfirm={() => void changeStatus(false)} />
    </div>
  );
}
