'use client';

import { useEffect, useMemo, useState } from 'react';

import { computeBatchStats } from '@/lib/domain/batch';
import type { BatchStats, BatchView } from '@/lib/domain/types';

/**
 * Ticks a batch view forward between server snapshots.
 *
 * The server sends an authoritative snapshot; this replays it locally each
 * second so the timer visibly counts up without a network round trip. Pause
 * arithmetic is re-derived with the same pure function the server uses
 * (`computeBatchStats`), so the client and server can never disagree about what
 * "active time" means.
 *
 * Exposed as a plain function (not a hook) so it can be applied to an arbitrary
 * number of stations in a loop — hooks cannot be called inside `.map()`.
 */
export function projectBatchView(view: BatchView | null, driftSeconds: number): BatchView | null {
  if (!view) return null;
  if (driftSeconds <= 0) return view;

  // The server's own arithmetic, replayed at the current instant. Used purely as
  // an upper bound so a resumed-from-sleep laptop cannot run the timer away.
  const serverNow = computeBatchStats(view.batch, [], [], Date.now());

  const advanced: BatchStats = {
    ...view.stats,
    elapsedSeconds: view.stats.elapsedSeconds + driftSeconds,
    pausedSeconds: view.stats.pausedSeconds + (view.stats.isPaused ? driftSeconds : 0),
    activeSeconds: view.stats.activeSeconds + (view.stats.isPaused ? 0 : driftSeconds),
    activePause: view.stats.activePause
      ? {
          ...view.stats.activePause,
          durationSeconds: view.stats.activePause.durationSeconds + driftSeconds,
        }
      : null,
  };

  const safeElapsed = Math.max(
    view.stats.elapsedSeconds,
    Math.min(advanced.elapsedSeconds, serverNow.elapsedSeconds + 2),
  );

  return {
    ...view,
    stats: {
      ...advanced,
      elapsedSeconds: safeElapsed,
      activeSeconds: Math.max(0, safeElapsed - advanced.pausedSeconds),
    },
  };
}

/** Memoised hook wrapper, for components that render exactly one batch. */
export function useLiveBatchView(view: BatchView | null, driftSeconds: number): BatchView | null {
  return useMemo(() => projectBatchView(view, driftSeconds), [view, driftSeconds]);
}

/** A plain 1-second ticker, for components that only need "now". */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
