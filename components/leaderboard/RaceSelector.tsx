'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import type { RaceSummary } from '@/lib/domain/types';
import { formatDate, formatInt, formatPoints } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { Badge } from '@/components/ui/primitives';

export type RaceScope = 'active' | 'archived' | 'all';

const SCOPES: Array<{
  key: RaceScope;
  labelKey: 'leaderboard.scopeActive' | 'leaderboard.scopeArchived' | 'leaderboard.scopeAll';
  icon: string;
}> = [
  { key: 'active', labelKey: 'leaderboard.scopeActive', icon: '🏁' },
  { key: 'archived', labelKey: 'leaderboard.scopeArchived', icon: '🗄️' },
  { key: 'all', labelKey: 'leaderboard.scopeAll', icon: '📚' },
];

/**
 * Race selector for the leaderboard, with scope filter tabs.
 *
 * Three side-by-side tabs — **מרוצים פעילים / ארכיון / הכל** — narrow the list,
 * and the page opens on **מרוצים פעילים** by default so a supervisor sees the
 * live standings immediately instead of scrolling past months of archive.
 *
 * Both the scope and the chosen race live in the URL (`?scope=…&raceId=…`), so
 * any view is a shareable, bookmarkable link and the server does the filtering —
 * the browser never holds more than one race's rows.
 *
 * Each race card carries its own totals, so a past race can be assessed before
 * opening it.
 */
export function RaceSelector({
  summaries,
  selectedRaceId,
  scope,
}: {
  summaries: RaceSummary[];
  selectedRaceId: string | null;
  scope: RaceScope;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeScope, setActiveScope] = useState<RaceScope>(scope);

  const counts = useMemo(
    () => ({
      active: summaries.filter((summary) => summary.race.status === 'ACTIVE').length,
      archived: summaries.filter((summary) => summary.race.status === 'FINISHED').length,
      all: summaries.length,
    }),
    [summaries],
  );

  const visible = useMemo(() => {
    const filtered =
      activeScope === 'active'
        ? summaries.filter((summary) => summary.race.status === 'ACTIVE')
        : activeScope === 'archived'
          ? summaries.filter((summary) => summary.race.status === 'FINISHED')
          : summaries;

    // Active races first, primary before secondary, then most recent.
    return [...filtered].sort((a, b) => {
      if (a.race.status !== b.race.status) return a.race.status === 'ACTIVE' ? -1 : 1;
      if (a.race.isPrimary !== b.race.isPrimary) return a.race.isPrimary ? -1 : 1;
      return new Date(b.race.startAt).getTime() - new Date(a.race.startAt).getTime();
    });
  }, [summaries, activeScope]);

  const navigate = (nextScope: RaceScope, nextRaceId: string | null) => {
    const params = new URLSearchParams();
    params.set('scope', nextScope);
    if (nextRaceId) params.set('raceId', nextRaceId);
    startTransition(() => {
      router.push(`/leaderboard?${params.toString()}`);
    });
  };

  const matchesScope = (summary: RaceSummary, target: RaceScope) =>
    target === 'active'
      ? summary.race.status === 'ACTIVE'
      : target === 'archived'
        ? summary.race.status === 'FINISHED'
        : true;

  const changeScope = (next: RaceScope) => {
    setActiveScope(next);
    // Keep the current race selected when it is still in scope, otherwise fall
    // back to the first visible race so the board is never blank.
    const currentStillVisible = summaries.some(
      (summary) => summary.race.id === selectedRaceId && matchesScope(summary, next),
    );
    const nextRaceId = currentStillVisible
      ? selectedRaceId
      : (summaries.find((summary) => matchesScope(summary, next))?.race.id ?? null);

    navigate(next, nextRaceId);
  };

  if (summaries.length === 0) return null;

  return (
    <section className="card card-pad mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-black text-ink">
          <span aria-hidden>🗂️</span>
          {t('admin.races.selectRace')}
        </h2>
        {pending ? <Badge tone="neutral">{t('common.loading')}</Badge> : null}
      </div>

      {/* Scope tabs */}
      <div
        role="tablist"
        aria-label={t('leaderboard.scopeHint')}
        className="mb-4 grid grid-cols-3 gap-2 sm:inline-grid sm:w-auto"
      >
        {SCOPES.map((entry) => {
          const isActive = activeScope === entry.key;
          const count = counts[entry.key];
          return (
            <button
              key={entry.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => changeScope(entry.key)}
              className={[
                'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors',
                isActive
                  ? 'bg-brand-600 text-white shadow-card'
                  : 'bg-surface-muted text-ink-soft hover:bg-surface-sunken',
              ].join(' ')}
            >
              <span aria-hidden>{entry.icon}</span>
              <span className="truncate">{t(entry.labelKey)}</span>
              <span
                className={[
                  'numeric rounded-lg px-1.5 py-0.5 text-[11px] font-black',
                  isActive ? 'bg-white/20 text-white' : 'bg-white text-ink-muted',
                ].join(' ')}
              >
                {formatInt(count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Race cards */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-line bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
          {activeScope === 'archived' ? t('leaderboard.noArchived') : t('leaderboard.noRacesInScope')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visible.map((summary) => {
            const isSelected = summary.race.id === selectedRaceId;
            return (
              <button
                key={summary.race.id}
                type="button"
                onClick={() => navigate(activeScope, summary.race.id)}
                aria-pressed={isSelected}
                className={[
                  'flex min-w-[210px] flex-col items-start gap-1 rounded-2xl border-2 px-4 py-3 text-start transition-colors',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                    : 'border-surface-line bg-white hover:border-brand-300 hover:bg-surface-muted',
                ].join(' ')}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-black text-ink">
                    {summary.race.name}
                  </span>
                  {summary.race.isPrimary ? (
                    <span className="badge badge-brand !px-1.5 !py-0.5 !text-[10px]">
                      ★ {t('admin.races.primary')}
                    </span>
                  ) : summary.race.status === 'ACTIVE' ? (
                    <span className="badge badge-live !px-1.5 !py-0.5 !text-[10px]">
                      {t('admin.races.live')}
                    </span>
                  ) : (
                    <span className="badge badge-neutral !px-1.5 !py-0.5 !text-[10px]">
                      {t('admin.races.archive')}
                    </span>
                  )}
                </span>

                <span className="numeric text-[11px] text-ink-muted">
                  {formatDate(summary.race.startAt)}
                  {summary.race.endAt ? ` → ${formatDate(summary.race.endAt)}` : ''}
                </span>

                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-bold">
                  <span className="numeric text-brand-600">
                    {formatPoints(summary.points)} {t('leaderboard.points')}
                  </span>
                  <span className="numeric text-live-600">
                    {formatInt(summary.pallets)} {t('leaderboard.pallets')}
                  </span>
                  <span className="numeric text-ink-muted">
                    {formatInt(summary.workers)} {t('leaderboard.worker')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
