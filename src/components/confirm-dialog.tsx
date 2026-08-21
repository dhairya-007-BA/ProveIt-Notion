"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, loading = false, error, onCancel, onConfirm }: ConfirmDialogProps) {
  return <Dialog
    open={open}
    onClose={() => { if (!loading) onCancel(); }}
    dismissOnBackdrop={!loading}
    title={title}
    description={description}
    footer={<><Button type="button" variant="secondary" disabled={loading} onClick={onCancel}>Cancel</Button><Button type="button" variant="danger" loading={loading} loadingLabel="Working…" onClick={onConfirm}>{confirmLabel}</Button></>}
  >
    {error ? <p role="alert" className="proveit-feedback proveit-feedback-danger">{error}</p> : null}
  </Dialog>;
}
