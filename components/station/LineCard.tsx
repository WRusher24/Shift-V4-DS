'use client';

import { useState } from 'react';

import type { BatchView, ProductionLine } from '@/lib/domain/types';
import { formatClock, formatDateTime, formatDurationHe, formatInt, formatPoints } from '@/lib/domain/format';
import { pauseReasonLabel, t } from '@/lib/i18n/he';
import { Badge, Button, EmptyState } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/Modal';

/**
 * One line's live card on the station dashboard.
 *
 * Visual language:
 *   - electric green glow + pulsing dot  -> the line is running
 *   - safety amber glow                  -> the line is paused
 *
 * The line is a dynamic record, so the name, short code and position all come
 * from `ProductionLine` rather than a hard-coded label map. The timer is
 * rendered in a huge tabular-numeral face so it can be read from across the
 * factory floor.
 */
export function LineCard({
  line,
  view,
  onStart,
  onAddPallet,
  onPause,
  onResume,
  onTeam,
  onFinish,
  onCancel,
  busy,
}: {
  line: ProductionLine;
  view: BatchView | null;
  onStart: () => void;
  onAddPallet: () => void;
  onPause: () => void;
  onResume: () => void;
  onTeam: () => void;
  onFinish: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!view) {
    return (
      <section className="card flex min-h-[420px] flex-col p-5 sm:p-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-black text-ink">
            <span className="flex h-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken px-2.5 text-base font-black text-ink-soft">
              {line.code}
            </span>
            <span className="truncate">{line.name}</span>
          </h2>
          <Badge tone="neutral">{t('station.lineEmpty')}</Badge>
        </header>

        <div className="flex flex-1 items-center">
          <div className="w-full">
            <EmptyState
              icon="🛠️"
              title={t('station.lineEmpty')}
              hint={t('station.lineEmptyHint')}
              action={
                <Button variant="live" size="lg" onClick={onStart} icon="▶" disabled={busy}>
                  {t('station.startBatch')}
                </Button>
              }
            />
          </div>
        </div>
      </section>
    );
  }

  const { batch, product, stats, members } = view;
  const activeMembers = members.filter((member) => member.isCurrentlyActive);
  const isPaused = stats.isPaused;

  return (
    <section
      className={[
        'card flex flex-col overflow-hidden transition-shadow',
        isPaused ? 'shadow-paused' : 'shadow-live',
      ].join(' ')}
    >
      {/* Header */}
      <header
        className={[
          'flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4',
          isPaused ? 'border-safety-200 bg-safety-50' : 'border-live-200 bg-live-50',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={[
              'flex h-10 shrink-0 items-center justify-center rounded-xl px-2.5 text-base font-black text-white',
              isPaused ? 'bg-safety-500' : 'bg-live-600',
            ].join(' ')}
          >
            {line.code}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black leading-tight text-ink">{line.name}</h2>
            <p className="numeric text-xs text-ink-muted">
              {t('history.startTime')}: {formatDateTime(batch.startedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view.activeRaceNames.length > 0 ? (
            <Badge tone="brand" icon="🏁">
              {view.activeRaceNames.join(' · ')}
            </Badge>
          ) : (
            <Badge tone="paused" icon="⚠">
              {t('station.noActiveRace')}
            </Badge>
          )}
          {isPaused ? (
            <Badge tone="paused" icon="⏸" pulse>
              {t('station.paused')}
              {stats.activePause ? ` · ${pauseReasonLabel(stats.activePause.reasonCode)}` : ''}
            </Badge>
          ) : (
            <Badge tone="live" icon="●" pulse>
              {t('station.running')}
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        {/* Product + timer */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="stat-label">{t('history.product')}</p>
            <h3 className="truncate text-2xl font-black text-ink">{product.name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span>{product.sizeLabel}</span>
              <span aria-hidden>·</span>
              <span className="numeric">{formatPoints(product.pointValue)} נק׳ לקרטון</span>
              {batch.notes ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{batch.notes}</span>
                </>
              ) : null}
            </p>

            {/* Live timer */}
            <div className="mt-4">
              <p className="stat-label">{t('station.elapsed')}</p>
              <p
                className={[
                  'timer-display animate-glow-live rounded-2xl px-3 py-2',
                  isPaused ? 'animate-glow-paused bg-safety-50 text-safety-600' : 'bg-live-50 text-live-600',
                ].join(' ')}
                aria-live="off"
              >
                {formatClock(stats.elapsedSeconds)}
              </p>
            </div>
          </div>

          {/* Live counters */}
          <div className="grid grid-cols-2 gap-2.5 lg:w-[320px]">
            <Counter label={t('station.palletsLogged')} value={formatInt(stats.palletCount)} tone="brand" />
            <Counter label={t('station.cartons')} value={formatInt(stats.totalCartons)} tone="ink" />
            <Counter label={t('station.points')} value={formatPoints(stats.totalPoints)} tone="live" />
            <Counter label={t('station.pph')} value={formatPoints(stats.pointsPerHour)} tone="live" />
            <Counter label={t('station.activeTime')} value={formatClock(stats.activeSeconds)} tone="ink" />
            <Counter label={t('station.pausedTime')} value={formatClock(stats.pausedSeconds)} tone="paused" />
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-black text-ink">
              <span aria-hidden>👷</span>
              {t('station.team')}
              <span className="badge badge-live">{formatInt(activeMembers.length)}</span>
            </h3>
            <Button variant="ghost" size="sm" onClick={onTeam} icon="👥">
              {t('station.teamChange')}
            </Button>
          </div>

          <ul className="flex flex-wrap gap-2">
            {members.map((member) => (
              <li
                key={member.memberId}
                className={[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                  member.isCurrentlyActive
                    ? 'border-live-200 bg-live-50'
                    : 'border-surface-line bg-surface-muted opacity-60',
                ].join(' ')}
                title={
                  member.leftAt
                    ? `${t('station.leftAt')}: ${formatDateTime(member.leftAt)}`
                    : t('station.stillHere')
                }
              >
                <span aria-hidden className="text-xl leading-none">
                  {member.emoji}
                </span>
                <span className="font-bold text-ink">{member.fullName}</span>
                <span className="numeric rounded-lg bg-white px-1.5 py-0.5 text-xs font-black text-live-600">
                  {formatPoints(member.points)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Primary actions */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            variant="live"
            size="lg"
            onClick={onAddPallet}
            disabled={busy || activeMembers.length === 0}
            icon="📦"
            className="sm:col-span-2"
          >
            {t('station.addPallet')}
          </Button>

          {isPaused ? (
            <Button variant="primary" size="lg" onClick={onResume} disabled={busy} icon="▶">
              {t('station.resume')}
            </Button>
          ) : (
            <Button variant="safety" size="lg" onClick={onPause} disabled={busy} icon="⏸">
              {t('station.pause')}
            </Button>
          )}

          <Button variant="ghost" size="lg" onClick={onFinish} disabled={busy} icon="🏁">
            {t('station.finish')}
          </Button>
        </div>

        {/* Recent pallets + pauses */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-black text-ink">{t('station.recentPallets')}</h3>
            {view.recentPallets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-surface-line bg-surface-muted/60 px-3 py-2.5 text-xs text-ink-muted">
                {t('common.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-surface-line overflow-hidden rounded-xl border border-surface-line bg-white">
                {view.recentPallets.map((pallet) => (
                  <li key={pallet.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden>📦</span>
                      <span className="numeric font-bold text-ink">
                        {formatInt(pallet.cartons)} {t('station.cartons')}
                      </span>
                      {pallet.note ? (
                        <span className="truncate text-xs text-ink-muted">— {pallet.note}</span>
                      ) : null}
                    </span>
                    <span className="numeric shrink-0 font-black text-live-600">
                      +{formatPoints(pallet.totalPoints)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-black text-ink">{t('station.pauseHistory')}</h3>
            {view.pauses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-surface-line bg-surface-muted/60 px-3 py-2.5 text-xs text-ink-muted">
                {t('common.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-surface-line overflow-hidden rounded-xl border border-surface-line bg-white">
                {view.pauses.slice(0, 6).map((pause) => (
                  <li key={pause.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden>{pause.isRunning ? '⏸' : '✅'}</span>
                      <span className="truncate font-bold text-ink">
                        {pause.reasonLabel ?? pauseReasonLabel(pause.reasonCode)}
                      </span>
                    </span>
                    <span
                      className={`numeric shrink-0 font-black ${
                        pause.isRunning ? 'text-safety-600' : 'text-ink-soft'
                      }`}
                    >
                      {formatClock(pause.durationSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Destructive escape hatch */}
        <div className="flex justify-end border-t border-surface-line pt-3">
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="text-xs font-bold text-danger-600 underline hover:text-danger-700"
          >
            {t('station.cancelBatch')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('station.cancelBatch')}
        message={t('station.cancelBatchConfirm')}
        confirmLabel={t('station.cancelBatch')}
        tone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          onCancel();
        }}
      />
    </section>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ink' | 'live' | 'paused' | 'brand';
}) {
  const toneClass =
    tone === 'live'
      ? 'text-live-600'
      : tone === 'paused'
        ? 'text-safety-600'
        : tone === 'brand'
          ? 'text-brand-600'
          : 'text-ink';

  return (
    <div className="rounded-xl border border-surface-line bg-surface-muted/60 px-3 py-2.5">
      <span className="stat-label block">{label}</span>
      <span className={`numeric text-2xl font-black leading-tight ${toneClass}`}>{value}</span>
    </div>
  );
}

/** Small helper used by the TV mode ticker. */
export function batchHeadline(view: BatchView): string {
  return `${view.line.name} · ${view.product.name} · ${formatDurationHe(view.stats.elapsedSeconds)}`;
}
