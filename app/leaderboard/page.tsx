import type { Metadata } from 'next';

import { DualLeaderboard } from '@/components/leaderboard/LeaderboardTable';
import { RaceSelector, type RaceScope } from '@/components/leaderboard/RaceSelector';
import { Badge, EmptyState, SectionHeader, StatTile } from '@/components/ui/primitives';
import { formatClock, formatDate, formatInt, formatPoints, formatRate } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { getRaceLeaderboard } from '@/lib/services/leaderboard';
import { getRaceSummaries } from '@/lib/services/races';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'לוח דירוג',
  description:
    'דירוג נפח ויעילות (נקודות לשעה) לכל מרוץ — פעיל או היסטורי — כולל סף שעות פעילות לזכאות.',
};

const SCOPES: readonly RaceScope[] = ['active', 'archived', 'all'];

function parseScope(value: string | undefined): RaceScope {
  return SCOPES.includes(value as RaceScope) ? (value as RaceScope) : 'active';
}

/**
 * Leaderboard screen.
 *
 * Opens on **מרוצים פעילים** by default: a supervisor landing here wants the
 * live standings, not months of archive. The scope tabs (active / archived / all)
 * and the chosen race are both URL parameters, so every view is bookmarkable and
 * shareable, and the server does the filtering.
 *
 * Points and pallets are read from the ledger's own race stamps, so a batch that
 * contributed to several concurrent races is counted correctly on every one of
 * their boards.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ raceId?: string; scope?: string }>;
}) {
  const { raceId, scope: rawScope } = await searchParams;
  const scope = parseScope(rawScope);

  const summaries = await getRaceSummaries();

  const inScope = summaries.filter((summary) =>
    scope === 'active'
      ? summary.race.status === 'ACTIVE'
      : scope === 'archived'
        ? summary.race.status === 'FINISHED'
        : true,
  );

  /**
   * Resolve which race to show. An explicit `raceId` wins; otherwise the primary
   * race when it is in scope, falling back to the first visible race so the board
   * is never blank on arrival.
   */
  const requested = raceId ? summaries.find((summary) => summary.race.id === raceId) : undefined;
  const fallback =
    inScope.find((summary) => summary.race.isPrimary) ?? inScope[0] ?? summaries.find((s) => s.race.isPrimary);

  const selectedRaceId = requested?.race.id ?? fallback?.race.id ?? null;

  const leaderboard = await getRaceLeaderboard(selectedRaceId ?? undefined);
  const race = leaderboard.race;
  const totals = leaderboard.totals;

  const archivedCount = summaries.filter((summary) => summary.race.status === 'FINISHED').length;

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <SectionHeader
        level={1}
        title={t('leaderboard.title')}
        subtitle={t('leaderboard.efficiencyHint')}
        actions={
          race ? (
            <>
              {race.isPrimary ? (
                <Badge tone="brand" icon="★">
                  {t('admin.races.primary')}
                </Badge>
              ) : null}
              <Badge tone={race.status === 'ACTIVE' ? 'live' : 'neutral'} icon="🏁">
                {race.status === 'ACTIVE' ? t('admin.races.live') : t('admin.races.archive')}
              </Badge>
            </>
          ) : (
            <Badge tone="danger" icon="⚠">
              {t('leaderboard.noRace')}
            </Badge>
          )
        }
      />

      {/* Race picker with scope tabs — every race, active or archived */}
      <RaceSelector summaries={summaries} selectedRaceId={selectedRaceId} scope={scope} />

      {/* Race banner */}
      {race ? (
        <section className="card card-pad mb-6 bg-gradient-to-l from-brand-50 to-white">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="stat-label">{t('leaderboard.race')}</p>
              <h2 className="text-2xl font-black text-ink">{race.name}</h2>
              <p className="numeric mt-1 text-sm text-ink-muted">
                {t('leaderboard.startedAt')}: {formatDate(race.startAt)}
                {race.endAt ? ` · ${t('history.finishTime')}: ${formatDate(race.endAt)}` : ''}
              </p>
              {race.archiveNote ? (
                <p className="mt-1 text-xs font-bold text-ink-muted">{race.archiveNote}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {race.prizeDescription ? (
                <div className="rounded-xl border border-safety-200 bg-safety-50 px-4 py-2.5">
                  <p className="stat-label">{t('leaderboard.prize')}</p>
                  <p className="font-black text-safety-700">{race.prizeDescription}</p>
                </div>
              ) : null}
              <div className="rounded-xl border border-brand-200 bg-white px-4 py-2.5">
                <p className="stat-label">{t('leaderboard.minHours')}</p>
                <p className="numeric font-black text-brand-700">
                  {t('leaderboard.minHoursValue', { hours: formatInt(race.minActiveHours) })}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mb-6">
          <EmptyState icon="🏁" title={t('leaderboard.noRace')} hint={t('leaderboard.noRaceHint')} />
        </section>
      )}

      {/* Race totals */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('leaderboard.points')} value={formatPoints(totals.points)} tone="brand" icon="⭐" />
        <StatTile
          label={t('leaderboard.pallets')}
          value={formatInt(totals.pallets)}
          tone="live"
          icon="📦"
          hint={`${formatInt(totals.cartons)} ${t('leaderboard.cartons')}`}
        />
        <StatTile
          label={t('leaderboard.hours')}
          value={formatRate(totals.activeSeconds / 3600)}
          icon="⏱"
          hint={formatClock(totals.activeSeconds)}
        />
        <StatTile
          label={t('leaderboard.qualified')}
          value={`${formatInt(totals.qualifiedWorkers)} / ${formatInt(totals.workers)}`}
          tone="live"
          icon="✅"
          hint={`${formatInt(totals.batches)} ${t('leaderboard.batches')}`}
        />
      </div>

      {/* The two rankings */}
      <DualLeaderboard leaderboard={leaderboard} />

      {/* Archive summary */}
      {archivedCount > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-black text-ink">
            {t('admin.races.history')} ({formatInt(archivedCount)})
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.races.name')}</th>
                  <th>{t('leaderboard.startedAt')}</th>
                  <th>{t('history.finishTime')}</th>
                  <th>{t('leaderboard.prize')}</th>
                  <th className="text-end">{t('leaderboard.points')}</th>
                  <th className="text-end">{t('leaderboard.pallets')}</th>
                  <th className="text-end">{t('leaderboard.minHours')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {summaries
                  .filter((summary) => summary.race.status === 'FINISHED')
                  .map((summary) => (
                    <tr key={summary.race.id}>
                      <td className="font-bold text-ink">{summary.race.name}</td>
                      <td className="numeric text-ink-soft">{formatDate(summary.race.startAt)}</td>
                      <td className="numeric text-ink-soft">
                        {summary.race.endAt ? formatDate(summary.race.endAt) : '—'}
                      </td>
                      <td className="text-ink-soft">{summary.race.prizeDescription ?? '—'}</td>
                      <td className="numeric text-end font-black text-brand-600">
                        {formatPoints(summary.points)}
                      </td>
                      <td className="numeric text-end text-live-600">{formatInt(summary.pallets)}</td>
                      <td className="numeric text-end text-ink-soft">
                        {formatInt(summary.race.minActiveHours)}
                      </td>
                      <td>
                        <a
                          href={`/leaderboard?scope=archived&raceId=${encodeURIComponent(summary.race.id)}`}
                          className="text-xs font-bold text-brand-600 underline"
                        >
                          {t('common.filter')}
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
