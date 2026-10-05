import { Spinner } from '@/components/ui/primitives';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-muted">
      <Spinner className="h-7 w-7 text-brand-600" />
      <p className="text-sm font-bold">טוען נתונים…</p>
    </div>
  );
}
