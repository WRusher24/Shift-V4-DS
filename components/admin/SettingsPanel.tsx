'use client';

import { useState } from 'react';

import type { TvPanelKey } from '@/lib/domain/types';
import { TV_PANEL_KEYS } from '@/lib/domain/types';
import { formatInt } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Badge, Button, SectionHeader } from '@/components/ui/primitives';
import { CheckboxRow, Field, NumberInput, TextInput } from '@/components/ui/fields';

export interface RuntimeSettings {
  factoryName: string;
  tvIdleSeconds: number;
  tvSlideSeconds: number;
  tvPanels: TvPanelKey[];
  defaultMinRaceHours: number;
}

/**
 * System settings.
 *
 * Five knobs matter operationally:
 *   - the factory name shown in the chrome
 *   - how long the dashboard waits before switching to TV Mode (default 10 s)
 *   - how long each TV Mode panel stays on screen (default 8 s)
 *   - **which panels** the TV Mode rotation includes
 *   - the default minimum-hours threshold applied to every newly opened race
 */
export function SettingsPanel({ initial }: { initial: RuntimeSettings }) {
  const [factoryName, setFactoryName] = useState(initial.factoryName);
  const [tvIdleSeconds, setTvIdleSeconds] = useState<number | ''>(initial.tvIdleSeconds);
  const [tvSlideSeconds, setTvSlideSeconds] = useState<number | ''>(initial.tvSlideSeconds);
  const [tvPanels, setTvPanels] = useState<TvPanelKey[]>(initial.tvPanels);
  const [defaultMinRaceHours, setDefaultMinRaceHours] = useState<number | ''>(initial.defaultMinRaceHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const togglePanel = (key: TvPanelKey, checked: boolean) => {
    setTvPanels((previous) =>
      checked
        ? TV_PANEL_KEYS.filter((candidate) => candidate === key || previous.includes(candidate))
        : previous.filter((candidate) => candidate !== key),
    );
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.put('/api/settings', {
        factoryName: factoryName.trim(),
        ...(typeof tvIdleSeconds === 'number' ? { tvIdleSeconds } : {}),
        ...(typeof tvSlideSeconds === 'number' ? { tvSlideSeconds } : {}),
        tvPanels,
        ...(typeof defaultMinRaceHours === 'number' ? { defaultMinRaceHours } : {}),
      });
      setNotice(t('admin.settings.saved'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title={t('admin.settings.title')}
        actions={
          <Button variant="primary" onClick={save} loading={saving} icon="💾">
            {t('common.save')}
          </Button>
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

      <div className="card card-pad max-w-2xl">
        <Field label={t('admin.settings.factoryName')}>
          <TextInput
            size="lg"
            value={factoryName}
            onChange={(event) => setFactoryName(event.target.value)}
            placeholder={t('app.factory')}
          />
        </Field>

        <Field label={t('admin.settings.tvIdle')} hint={t('admin.settings.tvIdleHint')}>
          <NumberInput
            size="lg"
            value={tvIdleSeconds}
            onValueChange={setTvIdleSeconds}
            min={3}
            max={600}
            suffix="שנ׳"
          />
        </Field>

        <Field label={t('admin.settings.tvSlide')} hint={t('admin.settings.tvSlideHint')}>
          <NumberInput
            size="lg"
            value={tvSlideSeconds}
            onValueChange={setTvSlideSeconds}
            min={3}
            max={120}
            suffix="שנ׳"
          />
          <p className="mt-2 text-xs font-bold text-brand-700">
            {t('admin.settings.tvPreview', {
              seconds: formatInt(typeof tvSlideSeconds === 'number' ? tvSlideSeconds : 8),
            })}
          </p>
        </Field>

        {/* ------------------------------------------ TV Mode panel selection */}
        <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-base font-black text-ink">
                <span aria-hidden>🖥️</span>
                {t('admin.settings.tvPanels')}
              </h3>
              <p className="text-xs text-ink-muted">{t('admin.settings.tvPanelsHint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={tvPanels.length > 0 ? 'brand' : 'paused'}>
                {t('admin.settings.tvPanelsCount', { count: formatInt(tvPanels.length) })}
              </Badge>
              <button
                type="button"
                className="text-xs font-bold text-brand-600 underline"
                onClick={() => setTvPanels([...TV_PANEL_KEYS])}
              >
                {t('admin.settings.tvPanelEnableAll')}
              </button>
              <button
                type="button"
                className="text-xs font-bold text-ink-muted underline"
                onClick={() => setTvPanels([])}
              >
                {t('admin.settings.tvPanelClear')}
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {TV_PANEL_KEYS.map((key) => (
              <CheckboxRow
                key={key}
                checked={tvPanels.includes(key)}
                onChange={(checked) => togglePanel(key, checked)}
                label={t(`tv.panel.${key}` as 'tv.panel.daily')}
              />
            ))}
          </div>

          {tvPanels.length === 0 ? (
            <p className="mt-3 rounded-xl border border-safety-200 bg-safety-50 px-3 py-2 text-xs font-bold text-safety-700">
              {t('admin.settings.tvPanelsNone')}
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">
              סדר התצוגה: <span className="numeric font-bold">{tvPanels.length}</span> שקופיות,{' '}
              {formatInt(typeof tvSlideSeconds === 'number' ? tvSlideSeconds : 8)} שניות כל אחת.
            </p>
          )}
        </div>

        <Field label={t('admin.settings.defaultMinHours')} hint={t('admin.races.minHoursHint')}>
          <NumberInput
            size="lg"
            integer={false}
            value={defaultMinRaceHours}
            onValueChange={setDefaultMinRaceHours}
            suffix={t('chart.axisHours')}
          />
        </Field>

        <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <p className="font-bold">מידע על המערכת</p>
          <ul className="mt-1.5 space-y-1 text-brand-800/90">
            <li>
              מרווח רענון הנתונים בתחנת העבודה: <span className="numeric font-bold">4</span> שניות.
            </li>
            <li>
              מצב מסך פועל בכל מסך באפליקציה — לא רק בתחנת העבודה. כל תזוזת עכבר, מגע או מקש מחזירים
              מיד לתצוגה הרגילה.
            </li>
            <li>
              מספר ספרות: כל המספרים מוצגים בספרות מערביות (<span className="numeric">0-9</span>) בלבד.
            </li>
            <li>
              כיוון הממשק: <span className="font-bold">RTL</span> מלא, כולל טפסים וטבלאות.
            </li>
            <li>
              קווי ייצור ומרוצים: דינמיים — ניתן להוסיף קווים ומרוצים ממרוץ במסכי הניהול.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
