'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/client/api';
import type { StationState } from '@/lib/domain/types';

const POLL_INTERVAL_MS = 4000;

export interface StationStateResult {
  state: StationState | null;
  error: string | null;
  loading: boolean;
  /** Local timestamp of the last successful fetch. */
  syncedAt: number | null;
  /**
   * Seconds elapsed on the client since the last successful fetch. Add this to
   * a server-computed duration to get a smoothly ticking, drift-free timer.
   */
  driftSeconds: number;
  refresh: () => Promise<void>;
}

/**
 * Polls `GET /api/state` on an interval.
 *
 * The server remains the single source of truth for every derived figure
 * (points, pause totals, leaderboards). The client only interpolates the
 * ticking timers between snapshots, which keeps the numbers on screen and the
 * numbers in the database in agreement.
 *
 * Polling pauses automatically while the tab is hidden, so a wall-mounted
 * display left on overnight does not hammer the API.
 */
export function useStationState(intervalMs = POLL_INTERVAL_MS): StationStateResult {
  const [state, setState] = useState<StationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [driftSeconds, setDriftSeconds] = useState(0);

  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const payload = await api.get<StationState>('/api/state');
      if (!mounted.current) return;
      setState(payload);
      setSyncedAt(Date.now());
      setDriftSeconds(0);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof ApiError ? caught.message : 'שגיאה בטעינת הנתונים.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Polling loop, suspended while the tab is hidden.
  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, intervalMs);
    };

    schedule();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, refresh]);

  // One-second drift ticker driving the live timers.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDriftSeconds((previous) => previous + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return { state, error, loading, syncedAt, driftSeconds, refresh };
}
