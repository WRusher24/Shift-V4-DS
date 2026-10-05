import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden className="text-5xl">
        🧭
      </span>
      <h1 className="text-3xl font-black text-ink">הדף לא נמצא</h1>
      <p className="text-base text-ink-soft">הכתובת שחיפשתם אינה קיימת במערכת שיפט.</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          תחנת עבודה
        </Link>
        <Link href="/leaderboard" className="btn btn-ghost">
          לוח דירוג
        </Link>
        <Link href="/admin" className="btn btn-ghost">
          ניהול
        </Link>
      </div>
    </div>
  );
}
