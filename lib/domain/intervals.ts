/**
 * Half-open interval algebra used to derive *active working time*.
 *
 * All values are epoch milliseconds. An interval `[start, end)` represents a
 * span during which something was true (a worker was on a batch, a batch was
 * running, a pause was open, ...).
 *
 * The authoritative definition used across the whole platform is:
 *
 *   workerActiveTime(batch) =
 *       duration( union(membershipIntervals) \ union(pauseIntervals) )
 *
 * In words: the time a worker was actually on the line, excluding every minute
 * the batch spent paused. This is what feeds the Efficiency leaderboard
 * (points-per-hour), so it must never be inflated by idle time.
 */

export interface Interval {
  /** Inclusive start, epoch ms. */
  start: number;
  /** Exclusive end, epoch ms. */
  end: number;
}

const SECOND_MS = 1000;

export function ms(date: string | Date): number {
  return date instanceof Date ? date.getTime() : new Date(date).getTime();
}

/** Clamp an interval list to a window. */
export function clip(intervals: Interval[], window: Interval): Interval[] {
  const out: Interval[] = [];
  for (const interval of intervals) {
    const start = Math.max(interval.start, window.start);
    const end = Math.min(interval.end, window.end);
    if (end > start) out.push({ start, end });
  }
  return out;
}

/** Drop empty/negative intervals and sort by start. */
export function sanitize(intervals: Interval[]): Interval[] {
  return intervals
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
}

/** Merge overlapping and touching intervals into a minimal disjoint set. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = sanitize(intervals);
  const out: Interval[] = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      out.push({ start: interval.start, end: interval.end });
    }
  }
  return out;
}

/** Total covered duration of an interval list, in milliseconds. */
export function totalMs(intervals: Interval[]): number {
  return merge(intervals).reduce((sum, interval) => sum + (interval.end - interval.start), 0);
}

/** Total covered duration of an interval list, in seconds. */
export function totalSeconds(intervals: Interval[]): number {
  return Math.round(totalMs(intervals) / SECOND_MS);
}

/** `base` minus `holes` — both are normalised internally. */
export function subtract(base: Interval[], holes: Interval[]): Interval[] {
  let result = merge(base);
  const normalizedHoles = merge(holes);

  for (const hole of normalizedHoles) {
    const next: Interval[] = [];
    for (const piece of result) {
      // No overlap: keep as-is.
      if (hole.end <= piece.start || hole.start >= piece.end) {
        next.push(piece);
        continue;
      }
      // Left remainder.
      if (hole.start > piece.start) next.push({ start: piece.start, end: hole.start });
      // Right remainder.
      if (hole.end < piece.end) next.push({ start: hole.end, end: piece.end });
    }
    result = next;
  }

  return result;
}

/** Intersection of two interval lists. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const left = merge(a);
  const right = merge(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (end > start) out.push({ start, end });
    if (left[i].end < right[j].end) i += 1;
    else j += 1;
  }
  return out;
}

/**
 * Seconds a worker was on the line and the line was running.
 *
 * @param membership Windows during which the worker belonged to the batch.
 * @param pauses     Pause windows recorded on the same batch.
 * @param window     The batch window (`startedAt` -> `finishedAt ?? now`).
 */
export function activeSecondsForWorker(
  membership: Interval[],
  pauses: Interval[],
  window: Interval,
): number {
  const clippedMembership = clip(membership, window);
  const clippedPauses = clip(pauses, window);
  return totalSeconds(subtract(clippedMembership, clippedPauses));
}

/** Build the batch window from ISO timestamps. */
export function batchWindow(startedAt: string, finishedAt: string | null, now = Date.now()): Interval {
  return { start: ms(startedAt), end: finishedAt ? ms(finishedAt) : now };
}
