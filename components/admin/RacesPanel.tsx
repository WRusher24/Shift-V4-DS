'use client';

import { useMemo, useState } from 'react';

import type { Product, Race, RaceLeaderboard, RaceSummary } from '@/lib/domain/types';
import { formatDate, formatInt, formatPoints, formatRate } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, SectionHeader, StatTile } from '@/components/ui/primitives';
import { Field, NumberInput, Select, TextInput } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`; the API wants an ISO instant. */
function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function fromDateInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface RaceImpact {
  awards: number;
  pallets: number;
  workers: number;
  batches: number;
  points: number;
}

/**
 * Race lifecycle management.
 *
 * **Two actions per race, and nothing else:**
 *
 *   - **סיום מרוץ** — close it and move it to the archive. Non-destructive: the
 *     race keeps its ledger rows and stays viewable under the archive filter.
 *   - **מחיקה** — delete it permanently, together with every point ever scored
 *     in it (`point_awards.race_id` cascades). The confirmation dialog fetches
 *     the actual impact first and states exactly what will be destroyed, because
 *     a generic warning is not consent.
 *
 * There is no "use as template" flow: races are configuration-light, and a new
 * race is opened directly from the form below.
 *
 * **Auto-archiving.** A race with an end date is closed automatically the first
 * time anything reads races after that deadline — no scheduler, no background
 * worker. The list below marks any race whose deadline has already passed.
 */
export function RacesPanel({
  initialRaces,
  initialLeaderboard,
  initialSummaries,
  products,
  defaultMinHours,
}: {
  initialRaces: Race[];
  initialLeaderboard: RaceLeaderboard;
  initialSummaries: RaceSummary[];
  products: Product[];
  defaultMinHours: number;
}) {
  const [races, setRaces] = useState<Race[]>(initialRaces);
  const [summaries, setSummaries] = useState<RaceSummary[]>(initialSummaries);
  const [leaderboard, setLeaderboard] = useState<RaceLeaderboard>(initialLeaderboard);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // --- new race form -------------------------------------------------------
  const [name, setName] = useState('');
  const [prize, setPrize] = useState('');
  const [minHours, setMinHours] = useState<number | ''>(defaultMinHours);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [asPrimary, setAsPrimary] = useState(true);

  // --- finish flow ---------------------------------------------------------
  const [finishTarget, setFinishTarget] = useState<Race | null>(null);
  const [archiveNote, setArchiveNote] = useState('');

  // --- delete flow ---------------------------------------------------------
  const [deleteTarget, setDeleteTarget] = useState<Race | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<RaceImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // --- point multipliers ---------------------------------------------------
  const [overridesRaceId, setOverridesRaceId] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, number | ''>>({});

  const now = Date.now();

  const activeRaces = useMemo(
    () =>
      races
        .filter((race) => race.status === 'ACTIVE')
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    [races],
  );
  const archivedRaces = useMemo(() => races.filter((race) => race.status === 'FINISHED'), [races]);

  const reload = async () => {
    const response = await api.get<{ races: Race[]; summaries: RaceSummary[] }>('/api/races?summaries=true');
    setRaces(response.races);
    setSummaries(response.summaries);
    setLeaderboard(await api.get<RaceLeaderboard>('/api/leaderboard'));
  };

  const startRace = async () => {
    setError(null);
    if (!name.trim()) {
      setError('יש להזין שם למרוץ.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/races', {
        name: name.trim(),
        prizeDescription: prize.trim() || null,
        ...(minHours === '' ? {} : { minActiveHours: Number(minHours) }),
        ...(startAt ? { startAt: fromDateInput(startAt) } : {}),
        ...(endAt ? { endAt: fromDateInput(endAt) } : {}),
        isPrimary: asPrimary,
      });
      setNotice(t('admin.races.started'));
      setName('');
      setPrize('');
      setStartAt('');
      setEndAt('');
      setAsPrimary(true);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  const promote = async (race: Race) => {
    setError(null);
    try {
      await api.post(`/api/races/${race.id}/primary`, {});
      setNotice(t('admin.races.primarySet'));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  /* ------------------------------------------------------------- finish */

  const openFinish = (race: Race) => {
    setFinishTarget(race);
    setArchiveNote('');
    setError(null);
  };

  const confirmFinish = async () => {
    if (!finishTarget) return;
    const target = finishTarget;
    setSaving(true);
    setError(null);

    try {
      await api.post(`/api/races/${target.id}/finish`, { archiveNote: archiveNote.trim() || null });
      setNotice(t('admin.races.finishedNotice'));
      setFinishTarget(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------- delete */

  /**
   * Opens the delete dialog and loads the real impact first, so the operator
   * confirms against actual numbers rather than a generic warning.
   */
  const openDelete = async (race: Race) => {
    setDeleteTarget(race);
    setDeleteImpact(null);
    setError(null);
    setLoadingImpact(true);
    try {
      setDeleteImpact(await api.get<RaceImpact>(`/api/races/${race.id}/impact`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setLoadingImpact(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setSaving(true);
    setError(null);

    try {
      const result = await api.delete<{ removedAwards: number }>(`/api/races/${target.id}`);
      setNotice(t('admin.races.deletedWithAwards', { count: formatInt(result.removedAwards) }));
      setDeleteTarget(null);
      setDeleteImpact(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------- point multipliers */

  const openOverrides = async (race: Race) => {
    setError(null);
    try {
      const response = await api.get<{ productPoints: Array<{ productId: string; pointValue: number }> }>(
        `/api/races/${race.id}/points`,
      );
      const drafts: Record<string, number | ''> = {};
      for (const product of products) {
        const override = response.productPoints.find((row) => row.productId === product.id);
        drafts[product.id] = override ? override.pointValue : '';
      }
      setOverrideDrafts(drafts);
      setOverridesRaceId(race.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  const saveOverrides = async () => {
    if (!overridesRaceId) return;
    setSaving(true);
    setError(null);

    try {
      const productPoints = Object.entries(overrideDrafts)
        .filter(([, value]) => typeof value === 'number' && value > 0)
        .map(([productId, value]) => ({ productId, pointValue: Number(value) }));

      await api.put(`/api/races/${overridesRaceId}/points`, { productPoints });
      setNotice(t('admin.races.overridesSaved'));
      setOverridesRaceId(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  const overridesRace = races.find((race) => race.id === overridesRaceId) ?? null;
  const winner = leaderboard.byVolume[0] ?? null;

  return (
    <div>
      <SectionHeader
        title={t('admin.races.title')}
        subtitle={t('admin.races.subtitle')}
        actions={
          <Badge tone={activeRaces.length > 0 ? 'live' : 'danger'}>
            {t('admin.races.activeCount', { count: formatInt(activeRaces.length) })}
          </Badge>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}

      {/* ------------------------------------------------------- active races */}
      <section className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-ink">
          <span aria-hidden>🏁</span>
          {t('admin.races.active')}
        </h3>

        {activeRaces.length === 0 ? (
          <EmptyState icon="🏁" title={t('admin.races.noActive')} hint={t('leaderboard.noRaceHint')} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeRaces.map((race) => {
              const summary = summaries.find((item) => item.race.id === race.id);
              const expired = race.endAt !== null && new Date(race.endAt).getTime() <= now;

              return (
                <article
                  key={race.id}
                  className={`card card-pad ${race.isPrimary ? 'ring-2 ring-brand-300' : ''}`}
                >
                  <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-xl font-black text-ink">{race.name}</h4>
                      <p className="numeric mt-0.5 text-xs text-ink-muted">
                        {formatDate(race.startAt)}
                        {race.endAt
                          ? ` → ${formatDate(race.endAt)}`
                          : ` → ${t('admin.races.endDateOptional')}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {race.isPrimary ? (
                        <Badge tone="brand" icon="★">
                          {t('admin.races.primary')}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">{t('admin.races.notPrimary')}</Badge>
                      )}
                      {expired ? (
                        <Badge tone="paused" icon="⏳">
                          {t('admin.races.expired')}
                        </Badge>
                      ) : null}
                    </div>
                  </header>

                  {race.prizeDescription ? (
                    <p className="mb-3 rounded-xl border border-safety-200 bg-safety-50 px-3 py-2 text-sm font-bold text-safety-700">
                      {t('leaderboard.prize')}: {race.prizeDescription}
                    </p>
                  ) : null}

                  <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-surface-muted px-2 py-2">
                      <span className="stat-label block">{t('leaderboard.points')}</span>
                      <span className="numeric text-lg font-black text-brand-600">
                        {formatPoints(summary?.points ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface-muted px-2 py-2">
                      <span className="stat-label block">{t('leaderboard.pallets')}</span>
                      <span className="numeric text-lg font-black text-live-600">
                        {formatInt(summary?.pallets ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface-muted px-2 py-2">
                      <span className="stat-label block">{t('leaderboard.minHours')}</span>
                      <span className="numeric text-lg font-black text-ink">
                        {formatInt(race.minActiveHours)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!race.isPrimary ? (
                      <Button variant="live" size="sm" onClick={() => void promote(race)} icon="★">
                        {t('admin.races.setPrimary')}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => void openOverrides(race)} icon="✎">
                      {t('admin.races.overrides')}
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => openFinish(race)} icon="🗄️">
                      {t('admin.races.finish')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void openDelete(race)} icon="🗑">
                      {t('admin.races.delete')}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {winner && leaderboard.race ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-live-200 bg-live-50 px-4 py-3">
            <span className="stat-label">{t('admin.races.currentWinner')}</span>
            <span aria-hidden className="text-2xl">
              {winner.worker.emoji}
            </span>
            <span className="font-black text-ink">{winner.worker.fullName}</span>
            <span className="text-xs text-ink-muted">· {leaderboard.race.name}</span>
            <span className="numeric ms-auto text-xl font-black text-live-600">
              {formatPoints(winner.points)}
            </span>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------- start a race */}
      <section className="card card-pad mb-8">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-black text-ink">
          <span aria-hidden>🚩</span>
          {t('admin.races.startNew')}
        </h3>
        <p className="mb-4 text-sm text-ink-muted">{t('admin.races.multipleHint')}</p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label={t('admin.races.name')} required>
            <TextInput
              size="lg"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('admin.races.namePlaceholder')}
            />
          </Field>

          <Field label={t('admin.races.prize')}>
            <TextInput
              size="lg"
              value={prize}
              onChange={(event) => setPrize(event.target.value)}
              placeholder={t('admin.races.prizePlaceholder')}
            />
          </Field>

          <Field label={t('admin.races.startAt')} hint="ריק = עכשיו">
            <TextInput
              type="datetime-local"
              freeText={false}
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
            />
          </Field>

          <Field label={t('admin.races.endDate')} hint={t('admin.races.autoArchiveHint')}>
            <TextInput
              type="datetime-local"
              freeText={false}
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
            />
          </Field>

          <Field label={t('admin.races.minHours')} hint={t('admin.races.minHoursHint')}>
            <NumberInput
              integer={false}
              value={minHours}
              onValueChange={setMinHours}
              suffix={t('chart.axisHours')}
            />
          </Field>
        </div>

        <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-surface-line bg-surface-muted/60 px-3.5 py-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={asPrimary}
            onChange={(event) => setAsPrimary(event.target.checked)}
          />
          <span className="text-sm font-bold text-ink">
            {t('admin.races.primary')} — כברירת מחדל לתצוגה
          </span>
        </label>

        <Button variant="live" size="lg" block onClick={startRace} loading={saving} icon="🚩">
          {t('admin.races.startNew')}
        </Button>

        <p className="mt-3 text-xs text-ink-muted">
          כל המרוצים הפעילים צוברים נקודות במקביל מכל האצוות שרצות. פתיחת מרוץ חדש מתחילה מ-0 ואינה
          מפסיקה אצוות — המשטח הבא שנרשם בכל קו ייזקף גם למרוץ החדש.
        </p>
      </section>

      {/* ------------------------------------------------------ race totals */}
      {summaries.length > 0 ? (
        <section className="mb-8">
          <h3 className="mb-1 text-lg font-black text-ink">{t('admin.races.totals')}</h3>
          <p className="mb-3 text-sm text-ink-muted">{t('admin.races.summaryHint')}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.races.name')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('admin.races.startAt')}</th>
                  <th>{t('admin.races.endDate')}</th>
                  <th className="text-end">{t('leaderboard.points')}</th>
                  <th className="text-end">{t('leaderboard.pallets')}</th>
                  <th className="text-end">{t('leaderboard.cartons')}</th>
                  <th className="text-end">{t('leaderboard.batches')}</th>
                  <th className="text-end">{t('daily.workersOnFloor')}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr key={summary.race.id}>
                    <td className="font-bold text-ink">
                      {summary.race.isPrimary ? '★ ' : ''}
                      {summary.race.name}
                    </td>
                    <td>
                      {summary.race.status === 'ACTIVE' ? (
                        <Badge tone="live">{t('admin.races.live')}</Badge>
                      ) : (
                        <Badge tone="neutral">{t('admin.races.archive')}</Badge>
                      )}
                    </td>
                    <td className="numeric text-ink-soft">{formatDate(summary.race.startAt)}</td>
                    <td className="numeric text-ink-soft">
                      {summary.race.endAt ? formatDate(summary.race.endAt) : '—'}
                    </td>
                    <td className="numeric text-end font-black text-brand-600">
                      {formatPoints(summary.points)}
                    </td>
                    <td className="numeric text-end text-live-600">{formatInt(summary.pallets)}</td>
                    <td className="numeric text-end text-ink-soft">{formatInt(summary.cartons)}</td>
                    <td className="numeric text-end text-ink-soft">{formatInt(summary.batches)}</td>
                    <td className="numeric text-end text-ink-soft">{formatInt(summary.workers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- archive */}
      {archivedRaces.length > 0 ? (
        <section>
          <h3 className="mb-1 text-lg font-black text-ink">{t('admin.races.history')}</h3>
          <p className="mb-3 text-sm text-ink-muted">{t('admin.races.autoArchiveHint')}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.races.name')}</th>
                  <th>{t('admin.races.startAt')}</th>
                  <th>{t('admin.races.endDate')}</th>
                  <th>{t('leaderboard.prize')}</th>
                  <th className="text-end">{t('leaderboard.minHours')}</th>
                  <th>{t('admin.races.archiveNote')}</th>
                </tr>
              </thead>
              <tbody>
                {archivedRaces.map((race) => (
                  <tr key={race.id}>
                    <td className="font-bold text-ink">{race.name}</td>
                    <td className="numeric text-ink-soft">{formatDate(race.startAt)}</td>
                    <td className="numeric text-ink-soft">{race.endAt ? formatDate(race.endAt) : '—'}</td>
                    <td className="text-ink-soft">{race.prizeDescription ?? '—'}</td>
                    <td className="numeric text-end text-ink-soft">{formatInt(race.minActiveHours)}</td>
                    <td className="text-ink-muted">{race.archiveNote ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------- finish race modal */}
      <Modal
        open={finishTarget !== null}
        onClose={() => !saving && setFinishTarget(null)}
        title={t('admin.races.finish')}
        subtitle={finishTarget?.name}
        size="md"
        dismissable={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinishTarget(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={confirmFinish} loading={saving} icon="🗄️">
              {t('admin.races.finish')}
            </Button>
          </>
        }
      >
        {error ? (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mb-4">
          <Alert tone="info">{t('admin.races.finishConfirm')}</Alert>
        </div>

        <Field label={`${t('admin.races.archiveNote')} (${t('common.optional')})`}>
          <TextInput
            value={archiveNote}
            onChange={(event) => setArchiveNote(event.target.value)}
            placeholder={t('admin.races.archiveNotePlaceholder')}
          />
        </Field>

        <div className="rounded-xl border border-surface-line bg-surface-muted/60 px-4 py-3">
          <p className="stat-label mb-1">{t('admin.races.totals')}</p>
          <p className="numeric text-sm font-bold text-ink">
            {formatPoints(leaderboard.totals.points)} {t('leaderboard.points')} ·{' '}
            {formatInt(leaderboard.totals.pallets)} {t('leaderboard.pallets')} ·{' '}
            {formatRate(leaderboard.totals.activeSeconds / 3600)} {t('leaderboard.hours')}
          </p>
        </div>
      </Modal>

      {/* ------------------------------------------------- delete race modal */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => !saving && setDeleteTarget(null)}
        title={t('admin.races.delete')}
        subtitle={deleteTarget?.name}
        size="md"
        dismissable={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              loading={saving}
              disabled={loadingImpact}
              icon="🗑"
            >
              {t('admin.races.delete')}
            </Button>
          </>
        }
      >
        {error ? (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mb-4">
          <Alert tone="error">{t('admin.races.deleteWarning')}</Alert>
        </div>

        <div className="mb-4 rounded-xl border border-danger-100 bg-danger-50 px-4 py-3">
          <p className="stat-label mb-2">{t('admin.races.deleteImpact')}</p>
          {loadingImpact ? (
            <p className="text-sm font-bold text-danger-700">{t('common.loading')}</p>
          ) : deleteImpact ? (
            <ul className="space-y-1 text-sm font-bold text-danger-700">
              <li>{t('admin.races.deleteImpactPoints', { points: formatPoints(deleteImpact.points) })}</li>
              <li>{t('admin.races.deleteImpactAwards', { count: formatInt(deleteImpact.awards) })}</li>
              <li>{t('admin.races.deleteImpactPallets', { count: formatInt(deleteImpact.pallets) })}</li>
              <li>{t('admin.races.deleteImpactWorkers', { count: formatInt(deleteImpact.workers) })}</li>
            </ul>
          ) : (
            <p className="text-sm font-bold text-danger-700">—</p>
          )}
        </div>

        <p className="text-xs text-ink-muted">{t('admin.races.deleteSuggestArchive')}</p>
      </Modal>

      {/* --------------------------------------------- point overrides modal */}
      <Modal
        open={overridesRaceId !== null}
        onClose={() => !saving && setOverridesRaceId(null)}
        title={t('admin.races.overrides')}
        subtitle={overridesRace?.name}
        size="lg"
        dismissable={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverridesRaceId(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={saveOverrides} loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {error ? (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mb-4">
          <Alert tone="info">{t('admin.races.overridesHint')}</Alert>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.products.name')}</th>
                <th className="text-end">{t('admin.races.overrideDefault')}</th>
                <th className="w-40 text-end">{t('admin.products.pointValue')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <span className="block font-bold text-ink">{product.name}</span>
                    <span className="block text-xs text-ink-muted">{product.sizeLabel}</span>
                  </td>
                  <td className="numeric text-end text-ink-muted">{formatPoints(product.pointValue)}</td>
                  <td>
                    <NumberInput
                      integer={false}
                      value={overrideDrafts[product.id] ?? ''}
                      onValueChange={(value) =>
                        setOverrideDrafts((previous) => ({ ...previous, [product.id]: value }))
                      }
                      placeholder={String(product.pointValue)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Summary tiles keep the panel's headline numbers visible on wide screens */}
      {leaderboard.race ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t('leaderboard.points')} value={formatPoints(leaderboard.totals.points)} tone="brand" />
          <StatTile label={t('leaderboard.pallets')} value={formatInt(leaderboard.totals.pallets)} tone="live" />
          <StatTile label={t('leaderboard.hours')} value={formatRate(leaderboard.totals.activeSeconds / 3600)} />
          <StatTile
            label={t('leaderboard.qualified')}
            value={`${formatInt(leaderboard.totals.qualifiedWorkers)}/${formatInt(leaderboard.totals.workers)}`}
            tone="live"
          />
        </div>
      ) : null}
    </div>
  );
}
