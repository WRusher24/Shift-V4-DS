'use client';

import { useEffect, useState } from 'react';

import type { BatchView } from '@/lib/domain/types';
import { formatClock, formatInt, formatPoints } from '@/lib/domain/format';
import { pauseReasonLabel, t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Button } from '@/components/ui/primitives';
import { Field, Textarea } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';

/**
 * Batch close-out.
 *
 * Shows the final numbers the operator is about to commit — including any
 * pause that is still open and will be closed automatically — so the summary
 * is verified before it becomes part of the payroll ledger.
 */
export function FinishDialog({
  open,
  batch,
  onClose,
  onFinished,
}: {
  open: boolean;
  batch: BatchView;
  onClose: () => void;
  onFinished: () => void | Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNotes(batch.batch.notes ?? '');
    setError(null);
  }, [open, batch.batch.notes]);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/batches/${batch.batch.id}/finish`, { notes: notes.trim() || null });
      await onFinished();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  const activeMembers = batch.members.filter((member) => member.isCurrentlyActive);

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={t('station.finishTitle')}
      subtitle={t('station.finishConfirm')}
      size="md"
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={saving} icon="🏁">
            {t('station.finishSubmit')}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}

      {batch.stats.isPaused ? (
        <div className="mb-4">
          <Alert tone="warning">
            קיימת השהיה פתוחה ({batch.stats.activePause ? pauseReasonLabel(batch.stats.activePause.reasonCode) : ''}).
            היא תיסגר אוטומטית עם סיום האצווה.
          </Alert>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label={t('station.elapsed')} value={formatClock(batch.stats.elapsedSeconds)} tone="ink" />
        <Summary label={t('station.activeTime')} value={formatClock(batch.stats.activeSeconds)} tone="live" />
        <Summary label={t('station.pausedTime')} value={formatClock(batch.stats.pausedSeconds)} tone="paused" />
        <Summary label={t('station.points')} value={formatPoints(batch.stats.totalPoints)} tone="brand" />
        <Summary label={t('station.palletsLogged')} value={formatInt(batch.stats.palletCount)} tone="ink" />
        <Summary label={t('station.cartons')} value={formatInt(batch.stats.totalCartons)} tone="ink" />
        <Summary label={t('station.pph')} value={formatPoints(batch.stats.pointsPerHour)} tone="live" />
        <Summary label={t('station.team')} value={formatInt(batch.members.length)} tone="ink" />
      </dl>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-black text-ink">{t('station.teamPoints')}</h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {batch.members.map((member) => (
            <li
              key={member.memberId}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                member.isCurrentlyActive ? 'border-live-200 bg-live-50' : 'border-surface-line bg-surface-muted'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="text-lg">
                  {member.emoji}
                </span>
                <span className="truncate font-bold text-ink">{member.fullName}</span>
              </span>
              <span className="numeric font-black text-live-600">{formatPoints(member.points)}</span>
            </li>
          ))}
        </ul>
        {activeMembers.length !== batch.members.length ? (
          <p className="hint">
            {formatInt(activeMembers.length)} מתוך {formatInt(batch.members.length)} עובדים נוכחים כעת.
            עובדים שעזבו שומרים על הנקודות שצברו.
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <Field label={t('station.finishNotes')} htmlFor="finish-notes">
          <Textarea
            id="finish-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="לדוגמה: הושלם מטען מלא, נדרש ניקוי בסיום"
          />
        </Field>
      </div>
    </Modal>
  );
}

function Summary({
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
      <dt className="stat-label">{label}</dt>
      <dd className={`numeric text-xl font-black ${toneClass}`}>{value}</dd>
    </div>
  );
}
