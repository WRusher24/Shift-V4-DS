'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reports whether the user has been idle for `timeoutMs`.
 *
 * Used by the dashboard to switch into full-screen TV Mode after 10 seconds of
 * no mouse or keyboard activity. The timer restarts on any of:
 * mousemove, mousedown, wheel, keydown, touchstart, pointerdown.
 *
 * The listener is attached with `passive: true` and the handler is throttled to
 * at most one state update per second, so the detection itself never causes
 * layout thrash on a low-powered factory tablet.
 */
export function useIdle(timeoutMs: number, options?: { enabled?: boolean }): {
  isIdle: boolean;
  reset: () => void;
  idleSeconds: number;
} {
  const enabled = options?.enabled ?? true;
  const [isIdle, setIsIdle] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(0);

  const lastActivity = useRef<number>(Date.now());
  const lastPublish = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setIsIdle(false);
      setIdleSeconds(0);
      return;
    }

    lastActivity.current = Date.now();

    const markActive = () => {
      lastActivity.current = Date.now();
      setIsIdle((previous) => (previous ? false : previous));
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'wheel',
      'keydown',
      'touchstart',
      'pointerdown',
      'scroll',
    ];

    for (const event of events) {
      window.addEventListener(event, markActive, { passive: true });
    }

    const ticker = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - lastActivity.current) / 1000);

      // Publish at most once per second to avoid needless re-renders.
      if (Date.now() - lastPublish.current >= 900) {
        lastPublish.current = Date.now();
        setIdleSeconds(seconds);
      }

      const shouldBeIdle = seconds * 1000 >= timeoutMs;
      setIsIdle((previous) => (previous === shouldBeIdle ? previous : shouldBeIdle));
    }, 250);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, markActive);
      }
      window.clearInterval(ticker);
    };
  }, [timeoutMs, enabled]);

  const reset = () => {
    lastActivity.current = Date.now();
    setIsIdle(false);
    setIdleSeconds(0);
  };

  return { isIdle, reset, idleSeconds };
}
