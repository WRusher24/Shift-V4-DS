'use client';

import { useEffect, useState } from 'react';

import type { BatchView, PauseReasonCode } from '@/lib/domain/types';
import { PAUSE_REASON_OPTIONS, t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Button } from '@/components/ui/primitives';
import { Field, Textarea } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';

/**
 * Downtime capture.
 *
 * The operator must pick a preset category; the free-text note is additive.
 * That structure is what makes the downtime report and the payroll review
 * possible — unstructured notes alone could not be aggregated.
 *
 * Pause time is banked completely separately from active working time, so a
 * two-hour stoppage never inflates anyone's points-per-hour.
 */
export function PauseDialog({
  open,
  batch,
  onClose,
  onSaved,
}: {
  open: boolean;
  batch: BatchView;
  onClose: () => void;
  onSaved: (view: BatchView) => void;
}) {
  const [reasonCode, setReasonCode] = useState<PauseReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReasonCode('');
    setNote('');
    setError(null);
  }, [open]);

  const submit = async () => {
    setError(null);

    if (!reasonCode) {
      setError('יש לבחור סיבת השהיה מהרשימה.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post<{ batch: BatchView }>(`/api/batches/${batch.batch.id}/pause`, {
        reasonCode,
        note: note.trim() || null,
      });
      onSaved(response.batch);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={t('station.pause')}
      subtitle={`${batch.product.name} · ${batch.members.filter((member) => member.isCurrentlyActive).length} עובדים נוכחים`}
      size="md"
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="safety" onClick={submit} loading={saving} icon="⏸">
            {t('station.pauseStart')}
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

      <Field label={t('station.pauseReason')} required>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAUSE_REASON_OPTIONS.map((option) => {
            const selected = reasonCode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setReasonCode(option.value)}
                aria-pressed={selected}
                className={[
                  'flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-start text-sm font-bold transition-colors',
                  selected
                    ? 'border-safety-400 bg-safety-50 text-safety-700 ring-2 ring-safety-200'
                    : 'border-surface-line bg-white text-ink-soft hover:bg-surface-muted',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                    selected ? 'border-safety-500 bg-safety-500' : 'border-surface-line'
                  }`}
                />
                {option.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={`${t('station.pauseNote')} (${t('common.optional')})`} htmlFor="pause-note">
        <Textarea
          id="pause-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="לדוגמה: החלפת תבנית לקו 2 ליטר"
        />
      </Field>

      <Alert tone="info">
        זמן ההשהיה נמדד בנפרד מזמן העבודה. נקודות לשעה (PPH) מחושבות רק על זמן עבודה נטו.
      </Alert>
    </Modal>
  );
}
