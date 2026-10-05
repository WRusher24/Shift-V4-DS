'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/primitives';

/**
 * Route-level error boundary.
 *
 * Shows the Hebrew message the server produced when it is available, and a
 * generic fallback otherwise. Never exposes a stack trace on the factory floor.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[shift] Route error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden className="text-5xl">
        ⛔
      </span>
      <h1 className="text-3xl font-black text-ink">אירעה שגיאה</h1>
      <p className="text-base text-ink-soft">
        {error.message || 'אירעה שגיאה בלתי צפויה בטעינת המסך. נסו לרענן.'}
      </p>
      {error.digest ? (
        <p className="numeric text-xs text-ink-faint">מזהה שגיאה: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={reset} icon="↻">
          ניסיון חוזר
        </Button>
        <a href="/" className="btn btn-ghost">
          חזרה לתחנת העבודה
        </a>
      </div>
    </div>
  );
}
