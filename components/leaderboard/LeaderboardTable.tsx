'use client';

import type { LeaderboardRow, RaceLeaderboard } from '@/lib/domain/types';
import { formatInt, formatPoints, formatRate } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/primitives';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Ranked table for one leaderboard category.
 *
 * The worker's unique emoji always sits immediately next to their name — this
 * is the platform's identity rule and is repeated on every surface
 * (leaderboards, active teams, history rows, CSV exports).
 */
export function LeaderboardTable({
  title,
  hint,
  rows,
  metric,
  minActiveHours = 0,
  showQualification = true,
  dense = false,
  highlightWorkerIds,
}: {
  title: string;
  hint?: string;
  rows: LeaderboardRow[];
  /** Which figure drives the ranking and the highlighted column. */
  metric: 'volume' | 'efficiency';
  /** Race threshold, rendered so the crew can see what they must clear. */
  minActiveHours?: number;
  showQualification?: boolean;
  dense?: boolean;
  highlightWorkerIds?: string[];
}) {
  const highlighted = new Set(highlightWorkerIds ?? []);
  const maxMetric = rows.reduce(
    (max, row) => Math.max(max, metric === 'volume' ? row.points : row.pointsPerHour),
    0,
  );

  if (rows.length === 0) {
    return (
      <section className="card card-pad">
        <h3 className="mb-3 text-lg font-black text-ink">{title}</h3>
        <EmptyState icon="🏁" title={t('leaderboard.empty')} hint={t('leaderboard.emptyHint')} />
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-line bg-surface-muted/70 px-5 py-3.5">
        <div>
          <h3 className="text-lg font-black text-ink">{title}</h3>
          {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
        </div>
        {showQualification && minActiveHours > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="paused" icon="⏱">
              {t('leaderboard.minHoursValue', { hours: formatInt(minActiveHours) })}
            </Badge>
            <Badge tone="brand">
              {t('leaderboard.qualifiedCount', {
                qualified: rows.filter((row) => row.qualified).length,
                total: rows.length,
              })}
            </Badge>
          </div>
        ) : null}
      </header>

      <div className="table-wrap rounded-none border-0">
        <table className="table">
          <thead>
            <tr>
              <th className="w-16 text-center">{t('leaderboard.rank')}</th>
              <th>{t('leaderboard.worker')}</th>
              <th className="text-end">{t('leaderboard.points')}</th>
              <th className="text-end">{t('leaderboard.hours')}</th>
              <th className="text-end">{t('leaderboard.pph')}</th>
              {!dense ? (
                <>
                  <th className="text-end">{t('leaderboard.cartons')}</th>
                  <th className="text-end">{t('leaderboard.pallets')}</th>
                  <th className="text-end">{t('leaderboard.batches')}</th>
                </>
              ) : null}
              {showQualification ? <th className="text-center">{t('leaderboard.qualified')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isHighlighted = highlighted.has(row.worker.workerId);
              const metricValue = metric === 'volume' ? row.points : row.pointsPerHour;
              const displayValue = metric === 'volume' ? formatPoints(row.points) : formatRate(row.pointsPerHour);

              return (
                <tr
                  key={row.worker.workerId}
                  className={[
                    !row.qualified && showQualification ? 'opacity-60' : '',
                    isHighlighted ? 'bg-brand-50/70' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="text-center">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-sm font-black text-ink-soft">
                      {row.rank <= 3 ? <span aria-hidden>{MEDALS[row.rank - 1]}</span> : formatInt(row.rank)}
                    </span>
                  </td>

                  <td>
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-surface-line bg-white text-xl"
                      >
                        {row.worker.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-ink">{row.worker.fullName}</span>
                        <span className="numeric block text-xs text-ink-muted">#{row.worker.employeeId}</span>
                      </span>
                    </div>
                    {!dense ? (
                      <div className="mt-2 max-w-[220px]">
                        <ProgressBar value={metricValue} max={maxMetric} tone={metric === 'volume' ? 'brand' : 'live'} />
                      </div>
                    ) : null}
                  </td>

                  <td className={`text-end font-black ${metric === 'volume' ? 'text-brand-600' : 'text-ink'}`}>
                    <span className="numeric text-lg">{formatPoints(row.points)}</span>
                  </td>

                  <td className="text-end text-ink-soft">
                    <span className="numeric">{formatRate(row.activeHours)}</span>
                  </td>

                  <td className={`text-end font-black ${metric === 'efficiency' ? 'text-live-600' : 'text-ink-soft'}`}>
                    <span className="numeric text-lg">{formatRate(row.pointsPerHour)}</span>
                  </td>

                  {!dense ? (
                    <>
                      <td className="text-end text-ink-soft">
                        <span className="numeric">{formatInt(row.cartons)}</span>
                      </td>
                      <td className="text-end text-ink-soft">
                        <span className="numeric">{formatInt(row.pallets)}</span>
                      </td>
                      <td className="text-end text-ink-soft">
                        <span className="numeric">{formatInt(row.batches)}</span>
                      </td>
                    </>
                  ) : null}

                  {showQualification ? (
                    <td className="text-center">
                      {row.qualified ? (
                        <Badge tone="live" icon="✔">
                          {t('leaderboard.qualified')}
                        </Badge>
                      ) : (
                        <span
                          className="badge badge-paused"
                          title={row.disqualifiedReason ?? t('leaderboard.notQualified')}
                        >
                          <span aria-hidden>⏳</span>
                          {t('leaderboard.notQualified')}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hidden-until-hover tooltips do not work on tablets; render the reason. */}
      {showQualification && rows.some((row) => !row.qualified) ? (
        <ul className="space-y-1 border-t border-surface-line bg-safety-50/60 px-5 py-3 text-xs text-safety-700">
          {rows
            .filter((row) => !row.qualified)
            .slice(0, 6)
            .map((row) => (
              <li key={row.worker.workerId} className="flex items-center gap-2">
                <span aria-hidden>{row.worker.emoji}</span>
                <span className="font-bold">{row.worker.fullName}</span>
                <span>— {row.disqualifiedReason}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Both rankings side by side — the canonical leaderboard view. */
export function DualLeaderboard({
  leaderboard,
  highlightWorkerIds,
  dense = false,
}: {
  leaderboard: RaceLeaderboard;
  highlightWorkerIds?: string[];
  dense?: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <LeaderboardTable
        title={`${t('leaderboard.volume')} — ${t('leaderboard.points')}`}
        hint={t('leaderboard.volumeHint')}
        rows={leaderboard.byVolume}
        metric="volume"
        minActiveHours={leaderboard.minActiveHours}
        dense={dense}
        highlightWorkerIds={highlightWorkerIds}
      />
      <LeaderboardTable
        title={t('leaderboard.efficiency')}
        hint={t('leaderboard.efficiencyHint')}
        rows={leaderboard.byEfficiency}
        metric="efficiency"
        minActiveHours={leaderboard.minActiveHours}
        dense={dense}
        highlightWorkerIds={highlightWorkerIds}
      />
    </div>
  );
}
