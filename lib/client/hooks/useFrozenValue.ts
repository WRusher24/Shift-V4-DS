'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Freezes a value while a surface is open.
 *
 * **Why this exists.** The station dashboard polls `/api/state` every four
 * seconds and ticks a local clock every single second. Both cause the whole
 * dashboard subtree to re-render, and a dialog rendered from that subtree
 * re-renders with it. A native `<select>` whose options are rebuilt on every
 * render dismisses its own popup — which is exactly what made the product
 * dropdown appear to "close by itself every second".
 *
 * The robust fix is to stop the polled data from reaching an open dialog at all:
 * the dialog keeps the snapshot it was opened with, so re-renders driven by
 * polling or by the clock cannot touch its children. Option lists are exactly the
 * kind of data where staleness is harmless — products, workers and pallet sizes
 * do not change while a supervisor is filling in a form.
 *
 * Do **not** use this for data that must reflect a mutation made *from inside*
 * the dialog (a team roster being edited in place, for example). Those surfaces
 * should keep reading live values.
 *
 * @param value  The live value.
 * @param frozen Whether the snapshot should be held.
 */
export function useFrozenWhileOpen<T>(value: T, frozen: boolean): T {
  const [snapshot, setSnapshot] = useState<T>(value);
  const wasFrozen = useRef(false);

  useEffect(() => {
    // Capture on the closed -> open transition, and refresh the snapshot while
    // closed so the next open starts from current data.
    if (!frozen || !wasFrozen.current) {
      setSnapshot(value);
    }
    wasFrozen.current = frozen;
  }, [frozen, value]);

  return frozen ? snapshot : value;
}
