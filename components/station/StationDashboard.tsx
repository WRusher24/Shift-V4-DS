'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BatchView, LeaderboardRow, StationState, StationView } from '@/lib/domain/types';
import {
  formatClock,
  formatDateTime,
  formatInt,
  formatPoints,
  formatRelativeHe,
} from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { useStationState } from '@/lib/client/hooks/useStationState';
import { projectBatchView } from '@/lib/client/hooks/useLiveTimer';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { AddPalletDialog } from '@/components/station/AddPalletDialog';
import { FinishDialog } from '@/components/station/FinishDialog';
import { LineCard } from '@/components/station/LineCard';
import { PauseDialog } from '@/components/station/PauseDialog';
import { StartBatchDialog } from '@/components/station/StartBatchDialog';
import { TeamDialog } from '@/components/station/TeamDialog';

type DialogKind = 'start' | 'pallet' | 'pause' | 'team' | 'finish' | null;

/**
 * The multi-line active batch station — the screen operators live on.
 *
 * Renders one card per **configured** production line, so the factory can grow
 * from two lines to five from the admin console without a code change. TV Mode
 * is no longer owned here: it lives in the app shell so it engages on every page.
 *
 * Responsibilities:
 *   - keep every station in sync with the server (4 s polling)
 *   - apply mutation results instantly so the floor never waits on a round trip
 *   - guard against a slow poll overwriting a fresh mutation result
 */
export function StationDashboard({ initialState }: { initialState: StationState }) {
  const { state, error, refresh, driftSeconds } = useStationState();

  /** Per-line overrides, keyed by line id, applied on top of the server state. */
  const [overrides, setOverrides] = useState<Record<string, BatchView | null>>({});
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogLineId, setDialogLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  /**
   * Guards against a slow poll overwriting a fresh mutation result: any server
   * snapshot generated before our last write is discarded.
   */
  const lastMutationAt = useRef(0);

  const serverStations = state?.stations ?? initialState.stations;

  useEffect(() => {
    if (!state) return;
    const generatedAt = new Date(state.generatedAt).getTime();
    if (generatedAt < lastMutationAt.current) return;
    // The server has caught up with every local change; drop the overrides.
    setOverrides({});
  }, [state]);

  /* ------------------------------------------------------------------ data */

  const stations: StationView[] = useMemo(
    () =>
      serverStations.map((station) => ({
        line: station.line,
        batch:
          station.line.id in overrides
            ? projectBatchView(overrides[station.line.id], driftSeconds)
            : projectBatchView(station.batch, driftSeconds),
      })),
    [serverStations, overrides, driftSeconds],
  );

  const workers = state?.workers ?? initialState.workers;
  const products = state?.products ?? initialState.products;
  const palletSizesByProduct = state?.palletSizesByProduct ?? initialState.palletSizesByProduct;
  const leaderboard = state?.leaderboard ?? initialState.leaderboard;
  const activeRace = state?.activeRace ?? initialState.activeRace;
  const activeRaces = state?.activeRaces ?? initialState.activeRaces;
  const todayTotals = state?.todayTotals ?? initialState.todayTotals;

  const runningCount = stations.filter((station) => station.batch !== null).length;

  const highlightWorkerIds = useMemo(
    () =>
      stations.flatMap((station) =>
        (station.batch?.members ?? [])
          .filter((member) => member.isCurrentlyActive)
          .map((member) => member.workerId),
      ),
    [stations],
  );

  const dialogLine = stations.find((station) => station.line.id === dialogLineId) ?? null;
  const dialogView = dialogLine?.batch ?? null;

  /* --------------------------------------------------------------- actions */

  const markMutation = () => {
    lastMutationAt.current = Date.now();
  };

  const setLineView = (lineId: string, view: BatchView | null) => {
    setOverrides((previous) => ({ ...previous, [lineId]: view }));
  };

  const runAction = async (lineId: string, action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      markMutation();
      await action();
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (kind: DialogKind, lineId: string) => {
    setDialogLineId(lineId);
    setDialog(kind);
  };

  const closeDialog = () => {
    setDialog(null);
    setDialogLineId(null);
  };

  const onServerRefresh = useCallback(async () => {
    markMutation();
    await refresh();
  }, [refresh]);

  /* ---------------------------------------------------------------- render */

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      {/* Title + race banner */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink">{t('station.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t('station.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeRace ? (
            <>
              <Badge tone="brand" icon="🏁">
                {activeRace.name}
              </Badge>
              <Badge tone="neutral" icon="⏱">
                {t('leaderboard.minHoursValue', { hours: formatInt(activeRace.minActiveHours) })}
              </Badge>
            </>
          ) : (
            <Badge tone="danger" icon="⚠">
              {t('leaderboard.noRace')}
            </Badge>
          )}
          <Badge tone="neutral" icon="🏭">
            {t('admin.lines.activeCount', { count: formatInt(stations.length) })}
          </Badge>
          <Badge tone={runningCount > 0 ? 'live' : 'neutral'} icon="●">
            {formatInt(runningCount)} / {formatInt(stations.length)} {t('station.running')}
          </Badge>
        </div>
      </div>

      {error ? (
        <div className="mb-5">
          <Alert tone="warning">{t('station.offline')}</Alert>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-5">
          <Alert tone="error" onDismiss={() => setActionError(null)}>
            {actionError}
          </Alert>
        </div>
      ) : null}

      {activeRaces.length === 0 ? (
        <div className="mb-5">
          <Alert tone="warning">{t('admin.races.noActive')}</Alert>
        </div>
      ) : null}

      {stations.length === 0 ? (
        <div className="mb-6">
          <Alert tone="warning">{t('error.lineRequired')}</Alert>
        </div>
      ) : null}

      {/* ---------------------------------------------------- daily headline */}
      {/*
        Pallet count is the primary figure — it is the unit the floor counts and
        carries. Cartons sit alongside it, and time/points fill out the row.
      */}
      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-stretch">
          {/* Pallets — the headline */}
          <div className="flex min-w-[240px] flex-1 items-center gap-5 bg-live-50 px-6 py-5">
            <span aria-hidden className="text-5xl">
              📦
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-live-700">
                {t('daily.palletsProduced')} · {t('daily.today')}
              </p>
              <p className="numeric text-6xl font-black leading-none text-live-600 sm:text-7xl">
                {formatInt(todayTotals.pallets)}
              </p>
              <p className="mt-1 text-sm font-bold text-live-700">
                {t('daily.pallets')}
              </p>
            </div>
          </div>

          {/* Cartons — alongside */}
          <div className="flex min-w-[190px] items-center gap-4 border-s border-surface-line px-6 py-5">
            <span aria-hidden className="text-3xl">
              🧃
            </span>
            <div>
              <p className="stat-label">{t('daily.cartons')}</p>
              <p className="numeric text-4xl font-black leading-none text-brand-600">
                {formatInt(todayTotals.cartons)}
              </p>
              <p className="mt-1 text-xs font-bold text-ink-muted">
                {formatInt(todayTotals.batchesCompleted)} {t('leaderboard.batches')}
              </p>
            </div>
          </div>

          {/* Points */}
          <div className="flex min-w-[170px] items-center gap-4 border-s border-surface-line px-6 py-5">
            <span aria-hidden className="text-3xl">
              ⭐
            </span>
            <div>
              <p className="stat-label">{t('daily.points')}</p>
              <p className="numeric text-4xl font-black leading-none text-live-600">
                {formatPoints(todayTotals.points)}
              </p>
              <p className="mt-1 truncate text-xs font-bold text-ink-muted">
                {activeRace ? activeRace.name : t('leaderboard.noRace')}
              </p>
            </div>
          </div>

          {/* Time */}
          <div className="flex min-w-[200px] items-center gap-4 border-s border-surface-line px-6 py-5">
            <span aria-hidden className="text-3xl">
              ⏱
            </span>
            <div>
              <p className="stat-label">{t('daily.activeTime')}</p>
              <p className="numeric text-4xl font-black leading-none text-ink">
                {formatClock(todayTotals.activeSeconds)}
              </p>
              <p className="numeric mt-1 text-xs font-bold text-safety-600">
                {t('daily.pausedTime')}: {formatClock(todayTotals.pausedSeconds)}
              </p>
            </div>
          </div>

          <div className="flex items-center px-6 py-5">
            <a href="/daily" className="btn btn-ghost btn-sm">
              {t('daily.title')}
            </a>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- the lines */}
      <div
        className={`grid gap-5 ${
          stations.length >= 3 ? 'xl:grid-cols-2 2xl:grid-cols-3' : 'xl:grid-cols-2'
        }`}
      >
        {stations.map((station) => (
          <LineCard
            key={station.line.id}
            line={station.line}
            view={station.batch}
            busy={busy}
            onStart={() => openDialog('start', station.line.id)}
            onAddPallet={() => openDialog('pallet', station.line.id)}
            onPause={() => openDialog('pause', station.line.id)}
            onResume={() =>
              runAction(station.line.id, async () => {
                const response = await api.post<{ batch: BatchView }>(
                  `/api/batches/${station.batch!.batch.id}/resume`,
                );
                setLineView(station.line.id, response.batch);
              })
            }
            onTeam={() => openDialog('team', station.line.id)}
            onFinish={() => {
              setDialogLineId(station.line.id);
              setConfirmFinish(true);
            }}
            onCancel={() =>
              runAction(station.line.id, async () => {
                await api.delete(`/api/batches/${station.batch!.batch.id}`);
                setLineView(station.line.id, null);
              })
            }
          />
        ))}
      </div>

      {/* Live mini leaderboards */}
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <MiniBoard
          title={t('leaderboard.volume')}
          rows={leaderboard.byVolume.slice(0, 6)}
          highlight={highlightWorkerIds}
          valueOf={(row) => formatPoints(row.points)}
          tone="brand"
        />
        <MiniBoard
          title={t('leaderboard.efficiency')}
          rows={leaderboard.byEfficiency.slice(0, 6)}
          highlight={highlightWorkerIds}
          valueOf={(row) => formatPoints(row.pointsPerHour)}
          tone="live"
        />
      </section>

      <p className="mt-5 text-center text-xs text-ink-muted">
        {t('station.lastUpdate')}: {state ? formatRelativeHe(state.generatedAt) : '—'} ·{' '}
        <span className="numeric">{formatDateTime(state?.generatedAt ?? initialState.generatedAt)}</span>
      </p>

      {/* ------------------------------------------------------------ dialogs */}

      {dialogLine ? (
        <StartBatchDialog
          open={dialog === 'start'}
          line={dialogLine.line}
          workers={workers}
          products={products}
          palletSizesByProduct={palletSizesByProduct}
          activeRaces={activeRaces}
          onClose={closeDialog}
          onStarted={onServerRefresh}
        />
      ) : null}

      {dialogView ? (
        <AddPalletDialog
          open={dialog === 'pallet'}
          batch={dialogView}
          onClose={closeDialog}
          onSaved={(view) => {
            markMutation();
            if (dialogLineId) setLineView(dialogLineId, view);
          }}
        />
      ) : null}

      {dialogView ? (
        <PauseDialog
          open={dialog === 'pause'}
          batch={dialogView}
          onClose={closeDialog}
          onSaved={(view) => {
            markMutation();
            if (dialogLineId) setLineView(dialogLineId, view);
          }}
        />
      ) : null}

      {dialogView ? (
        <TeamDialog
          open={dialog === 'team'}
          batch={dialogView}
          workers={workers}
          onClose={closeDialog}
          onSaved={(view) => {
            markMutation();
            if (dialogLineId) setLineView(dialogLineId, view);
          }}
        />
      ) : null}

      {dialogView ? (
        <FinishDialog
          open={dialog === 'finish'}
          batch={dialogView}
          onClose={closeDialog}
          onFinished={async () => {
            markMutation();
            if (dialogLineId) setLineView(dialogLineId, null);
            await refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmFinish}
        title={t('station.finishTitle')}
        message={t('station.finishConfirm')}
        confirmLabel={t('station.finish')}
        tone="primary"
        onCancel={() => {
          setConfirmFinish(false);
          setDialogLineId(null);
        }}
        onConfirm={() => {
          setConfirmFinish(false);
          setDialog('finish');
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mini leaderboard                                                          */
/* -------------------------------------------------------------------------- */

function MiniBoard({
  title,
  rows,
  highlight,
  valueOf,
  tone,
}: {
  title: string;
  rows: LeaderboardRow[];
  highlight: string[];
  valueOf: (row: LeaderboardRow) => string;
  tone: 'brand' | 'live';
}) {
  const highlighted = new Set(highlight);

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-surface-line bg-surface-muted/70 px-5 py-3">
        <h2 className="text-base font-black text-ink">{title}</h2>
        <a href="/leaderboard" className="text-xs font-bold text-brand-600 underline">
          {t('nav.leaderboard')}
        </a>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-ink-muted">{t('leaderboard.empty')}</p>
      ) : (
        <ul className="divide-y divide-surface-line">
          {rows.map((row) => (
            <li
              key={row.worker.workerId}
              className={`flex items-center gap-3 px-5 py-2.5 ${
                highlighted.has(row.worker.workerId) ? 'bg-brand-50/60' : ''
              }`}
            >
              <span className="numeric w-6 text-center text-sm font-black text-ink-muted">
                {formatInt(row.rank)}
              </span>
              <span aria-hidden className="text-xl leading-none">
                {row.worker.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                {row.worker.fullName}
              </span>
              {highlighted.has(row.worker.workerId) ? (
                <span className="badge badge-live">{t('station.onLine')}</span>
              ) : null}
              <span
                className={`numeric text-lg font-black ${
                  tone === 'brand' ? 'text-brand-600' : 'text-live-600'
                }`}
              >
                {valueOf(row)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
