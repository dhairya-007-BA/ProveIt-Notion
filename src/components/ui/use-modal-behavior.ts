"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function useModalBehavior(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => initialFocusRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !containerRef.current) return;
    const controls = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current === controls.length - 1 ? 0 : current + 1);
    event.preventDefault();
    controls[next]?.focus();
  }

  return { containerRef, initialFocusRef, onKeyDown } as { containerRef: RefObject<HTMLDivElement | null>; initialFocusRef: RefObject<HTMLButtonElement | null>; onKeyDown: typeof onKeyDown };
}
