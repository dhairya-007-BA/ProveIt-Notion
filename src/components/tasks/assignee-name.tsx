"use client";

import { useEffect, useState } from "react";

import { getUsers } from "@/lib/users";

let employeeNamesPromise: Promise<Record<string, string>> | null = null;
function employeeNames() {
  employeeNamesPromise ??= getUsers().then((users) => Object.fromEntries(users.filter((user) => user.active).map((user) => [user.uid, user.name])));
  return employeeNamesPromise;
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

export function AssigneeName({ uid, compact = false }: { uid?: string | null; compact?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => { if (!uid) return; void employeeNames().then((names) => setName(names[uid] ?? null)).catch(() => setName(null)); }, [uid]);
  if (!uid || !name) return <span className="text-[var(--muted)]">Unassigned</span>;
  return <span className="flex min-w-0 items-center gap-1.5" title={name}><span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--selected)] text-[9px] font-semibold text-[var(--secondary)]">{initials(name)}</span>{!compact && <span className="truncate">{name}</span>}</span>;
}
