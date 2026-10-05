import { randomUUID } from 'node:crypto';

/** Single place where new entity identifiers are minted. */
export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO string for `now + deltaMs`. */
export function isoOffset(deltaMs: number, from: Date = new Date()): string {
  return new Date(from.getTime() + deltaMs).toISOString();
}

export function hoursToMs(hours: number): number {
  return Math.round(hours * 3600 * 1000);
}

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60 * 1000);
}

/** Start of the local day containing `date`. */
export function startOfDay(date: Date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Start of the local day after the one containing `date`. */
export function endOfDay(date: Date = new Date()): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
