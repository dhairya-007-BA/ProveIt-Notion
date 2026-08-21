"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { ProveItUser } from "@/types/user";

type EmployeeMultiPickerProps = {
  label: string;
  users: ProveItUser[];
  value: string[];
  onChange: (userIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "?";
}

export function EmployeeMultiPicker({ label, users, value, onChange, disabled = false, placeholder = "Search employees…" }: EmployeeMultiPickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedIds = useMemo(() => new Set(value), [value]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.uid, user])), [users]);
  const selectedUsers = useMemo(() => value.flatMap((userId) => {
    const user = usersById.get(userId);
    return user ? [user] : [];
  }), [usersById, value]);
  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return users.filter((user) => !needle || [user.name, user.employeeId, user.email, user.department].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
  }, [query, users]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function toggle(userId: string) {
    onChange(selectedIds.has(userId) ? value.filter((candidate) => candidate !== userId) : [...value, userId]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!visibleUsers.length) return;
      setActiveIndex((current) => {
        if (current < 0) return event.key === "ArrowDown" ? 0 : visibleUsers.length - 1;
        return event.key === "ArrowDown" ? (current + 1) % visibleUsers.length : (current - 1 + visibleUsers.length) % visibleUsers.length;
      });
      return;
    }
    if (event.key === "Home" && open) { event.preventDefault(); setActiveIndex(0); return; }
    if (event.key === "End" && open) { event.preventDefault(); setActiveIndex(Math.max(visibleUsers.length - 1, 0)); return; }
    if (event.key === "Enter" && open && visibleUsers[activeIndex]) { event.preventDefault(); toggle(visibleUsers[activeIndex].uid); return; }
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
  }

  return <div ref={rootRef} className="relative">
    <div className={`proveit-control min-h-11 w-full px-2 py-1.5 ${disabled ? "cursor-not-allowed opacity-60" : "focus-within:ring-2 focus-within:ring-[var(--focus)]/35"}`}>
      {selectedUsers.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1.5" aria-label={`${selectedUsers.length} selected`}>
        {selectedUsers.map((user) => <span key={user.uid} className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-[var(--selected)] py-1 pl-1.5 pr-1 text-xs font-medium text-[var(--text)]">
          <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] text-[9px] text-[var(--secondary)]">{initials(user.name)}</span>
          <span className="max-w-40 truncate">{user.name}</span>
          <button type="button" disabled={disabled} aria-label={`Remove ${user.name}`} onClick={() => { toggle(user.uid); inputRef.current?.focus(); }} className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">×</button>
        </span>)}
      </div>}
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="pl-1 text-sm text-[var(--subtle)]">⌕</span>
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-activedescendant={open && visibleUsers[activeIndex] ? `${id}-option-${visibleUsers[activeIndex].uid}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedUsers.length ? "Add another employee…" : placeholder}
          className="min-h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--subtle)]"
        />
        <span aria-hidden="true" className={`pr-1 text-xs text-[var(--subtle)] transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </div>
    </div>
    {open && !disabled && <div id={`${id}-listbox`} role="listbox" aria-label={`${label} options`} aria-multiselectable="true" className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-md)]">
      {visibleUsers.length ? visibleUsers.map((user, index) => {
        const selected = selectedIds.has(user.uid);
        const active = index === activeIndex;
        return <button
          key={user.uid}
          id={`${id}-option-${user.uid}`}
          type="button"
          role="option"
          aria-selected={selected}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { toggle(user.uid); inputRef.current?.focus(); }}
          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${active ? "bg-[var(--hover)]" : ""}`}
        >
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--selected)] text-xs font-semibold text-[var(--secondary)]">{initials(user.name)}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{user.name}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{[user.employeeId && `Employee ID · ${user.employeeId}`, user.department].filter(Boolean).join(" · ")}</span></span>
          <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${selected ? "border-[var(--secondary)] bg-[var(--secondary)] text-white" : "border-[var(--border)] text-transparent"}`}>✓</span>
        </button>;
      }) : <p className="px-3 py-5 text-center text-sm text-[var(--muted)]">No employees match “{query.trim()}”.</p>}
    </div>}
    <p className="mt-1.5 text-xs text-[var(--muted)]" aria-live="polite">{value.length ? `${value.length} employee${value.length === 1 ? "" : "s"} selected` : "No employees selected"}</p>
  </div>;
}
