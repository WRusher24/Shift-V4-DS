/**
 * Application settings.
 *
 * Settings are stored as strings in the `app_settings` table so new keys can be
 * introduced without a migration. Every read falls back to an environment
 * variable and finally to a hard-coded default, which keeps a fresh install
 * fully functional with zero configuration.
 */

import type { AppSetting, TvPanelKey } from '@/lib/domain/types';
import { DEFAULT_TV_PANELS, TV_PANEL_KEYS } from '@/lib/domain/types';
import { SETTING_KEYS } from '@/lib/db/schema';
import { getRepository } from '@/lib/repo';

export { SETTING_KEYS };

/** Default TV Mode panel duration, in seconds. */
export const DEFAULT_TV_SLIDE_SECONDS = 8;

/** Default idle timeout before TV Mode engages, in seconds. */
export const DEFAULT_TV_IDLE_SECONDS = 10;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.MIN_RACE_HOURS]: process.env.SHIFT_MIN_RACE_HOURS ?? '30',
  [SETTING_KEYS.TV_IDLE_SECONDS]: process.env.SHIFT_TV_IDLE_SECONDS ?? String(DEFAULT_TV_IDLE_SECONDS),
  [SETTING_KEYS.TV_SLIDE_SECONDS]: process.env.SHIFT_TV_SLIDE_SECONDS ?? String(DEFAULT_TV_SLIDE_SECONDS),
  [SETTING_KEYS.TV_PANELS]: DEFAULT_TV_PANELS.join(','),
  [SETTING_KEYS.FACTORY_NAME]: 'מפעל חומרי ניקוי',
};

export async function listSettings(): Promise<AppSetting[]> {
  return getRepository().listSettings();
}

export async function getSetting(key: string): Promise<string> {
  const stored = await getRepository().getSetting(key);
  if (stored !== null) return stored;
  return DEFAULTS[key] ?? '';
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  const raw = (await getSetting(key)).trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

export async function setSetting(key: string, value: string): Promise<AppSetting> {
  return getRepository().setSetting(key, value);
}

/**
 * Reads the enabled TV Mode panels.
 *
 * The setting is a comma-separated list of panel keys. An empty string means the
 * administrator deliberately turned every panel off; a missing value falls back
 * to the full default rotation. Unknown keys are dropped, and the result keeps
 * the canonical display order so the rotation is stable.
 */
export async function getTvPanels(): Promise<TvPanelKey[]> {
  const raw = await getRepository().getSetting(SETTING_KEYS.TV_PANELS);
  if (raw === null) return [...DEFAULT_TV_PANELS];

  const selected = new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  return TV_PANEL_KEYS.filter((key) => selected.has(key));
}

export async function setTvPanels(panels: TvPanelKey[]): Promise<TvPanelKey[]> {
  const unique = TV_PANEL_KEYS.filter((key) => panels.includes(key));
  await getRepository().setSetting(SETTING_KEYS.TV_PANELS, unique.join(','));
  return unique;
}

export interface SettingsPatch {
  factoryName?: string;
  tvIdleSeconds?: number;
  /** How long each TV Mode panel stays on screen. */
  tvSlideSeconds?: number;
  /** Which panels the TV Mode rotation includes. */
  tvPanels?: TvPanelKey[];
  defaultMinRaceHours?: number;
}

export async function updateSettings(patch: SettingsPatch): Promise<AppSetting[]> {
  const repository = getRepository();
  const updated: AppSetting[] = [];

  if (patch.factoryName !== undefined) {
    updated.push(await repository.setSetting(SETTING_KEYS.FACTORY_NAME, patch.factoryName.trim()));
  }
  if (patch.tvIdleSeconds !== undefined) {
    const seconds = Math.max(3, Math.round(patch.tvIdleSeconds));
    updated.push(await repository.setSetting(SETTING_KEYS.TV_IDLE_SECONDS, String(seconds)));
  }
  if (patch.tvSlideSeconds !== undefined) {
    // The floor needs enough time to read a panel, so the floor is 3 seconds.
    const seconds = Math.max(3, Math.round(patch.tvSlideSeconds));
    updated.push(await repository.setSetting(SETTING_KEYS.TV_SLIDE_SECONDS, String(seconds)));
  }
  if (patch.tvPanels !== undefined) {
    const panels = await setTvPanels(patch.tvPanels);
    updated.push(
      await repository.setSetting(SETTING_KEYS.TV_PANELS, panels.join(',')),
    );
  }
  if (patch.defaultMinRaceHours !== undefined) {
    const hours = Math.max(0, patch.defaultMinRaceHours);
    updated.push(await repository.setSetting(SETTING_KEYS.MIN_RACE_HOURS, String(hours)));
  }

  return updated;
}

/** Snapshot used by the settings screen, the TV overlay and the idle timer. */
export async function getRuntimeSettings(): Promise<{
  factoryName: string;
  tvIdleSeconds: number;
  tvSlideSeconds: number;
  tvPanels: TvPanelKey[];
  defaultMinRaceHours: number;
}> {
  return {
    factoryName: await getSetting(SETTING_KEYS.FACTORY_NAME),
    tvIdleSeconds: await getNumberSetting(SETTING_KEYS.TV_IDLE_SECONDS, DEFAULT_TV_IDLE_SECONDS),
    tvSlideSeconds: await getNumberSetting(SETTING_KEYS.TV_SLIDE_SECONDS, DEFAULT_TV_SLIDE_SECONDS),
    tvPanels: await getTvPanels(),
    defaultMinRaceHours: await getNumberSetting(SETTING_KEYS.MIN_RACE_HOURS, 30),
  };
}
