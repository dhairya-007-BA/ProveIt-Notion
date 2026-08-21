import { cn } from "@/components/ui/utils";

export function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

export function Avatar({ className, name, size = "md" }: { className?: string; name?: string; size?: "sm" | "md" | "lg" }) {
  return <span aria-label={name || "ProveIt employee"} role="img" title={name} className={cn("inline-grid shrink-0 place-items-center rounded-full bg-[var(--info-soft)] font-semibold text-[var(--info)]", size === "sm" && "h-6 w-6 text-[10px]", size === "md" && "h-8 w-8 text-xs", size === "lg" && "h-12 w-12 text-sm", className)}>{initials(name)}</span>;
}
