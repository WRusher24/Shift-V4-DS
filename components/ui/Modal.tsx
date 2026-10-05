'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { t } from '@/lib/i18n/he';

/**
 * Accessible modal dialog.
 *
 * - Locks body scroll while open.
 * - Closes on Escape and on backdrop click.
 * - Moves focus into the dialog on open and restores it on close.
 * - Uses logical inset properties (`start-0 end-0`) so it is RTL-safe.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    /**
     * Signals "a modal is open" to the app shell so the global TV Mode idle
     * timer does not yank a dialog out from under the operator while they are
     * reading it. A data attribute is used rather than a React context so the
     * shell can observe it with a MutationObserver and stay decoupled from
     * whatever component tree opened the modal.
     */
    document.body.dataset.shiftModal = '1';

    const focusTimer = window.setTimeout(() => {
      const firstField = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea, button[data-autofocus]',
      );
      (firstField ?? panelRef.current)?.focus();
    }, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissable) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      delete document.body.dataset.shiftModal;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const widthClass = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`my-auto w-full ${widthClass} animate-slide-up rounded-2xl border border-surface-line bg-white shadow-raised`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-surface-line px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-black text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {dismissable ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded-lg px-2 py-1 text-2xl leading-none text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              ×
            </button>
          ) : null}
        </header>

        <div className="px-5 py-5 sm:px-6">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-surface-line bg-surface-muted/60 px-5 py-4 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for destructive actions. Every destructive path in the
 * app funnels through this so the Hebrew wording stays consistent.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'safety';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : tone === 'safety' ? 'btn-safety' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-soft">{message}</div>
    </Modal>
  );
}
