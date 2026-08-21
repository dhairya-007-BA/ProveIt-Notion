import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

import { cn } from "@/components/ui/utils";

export const controlClassName = "proveit-control w-full px-3 py-2 text-sm outline-none";

type ControlElementProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean };

export function FormControl({ children, className, error, helperText, id, label, required = false }: { children: ReactElement<ControlElementProps>; className?: string; error?: string; helperText?: string; id?: string; label: string; required?: boolean }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const descriptionId = error || helperText ? `${controlId}-description` : undefined;

  return <div className={className}>
    <label htmlFor={controlId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">{label}{required ? <span className="ml-1 text-[var(--danger)]" aria-hidden="true">*</span> : null}</label>
    {cloneElement(children, { id: controlId, "aria-describedby": descriptionId, "aria-invalid": Boolean(error) || undefined, required: required || children.props.required })}
    {error ? <p id={descriptionId} role="alert" className="mt-1.5 text-xs leading-5 text-[var(--danger)]">{error}</p> : helperText ? <p id={descriptionId} className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">{helperText}</p> : null}
  </div>;
}

export function FieldLabel({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-medium text-[var(--text)]", className)}>{children}</label>;
}
