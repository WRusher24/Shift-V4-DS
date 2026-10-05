'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BatchView } from '@/lib/domain/types';
import { computePalletPoints, splitPoints } from '@/lib/domain/points';
import { formatDecimal, formatInt, formatPoints } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { useFrozenWhileOpen } from '@/lib/client/hooks/useFrozenValue';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { Field, NumberInput, Textarea } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';

interface LoggedFeedback {
  cartons: number;
  totalPoints: number;
  memberCount: number;
  perMember: number;
  raceCount: number;
}

/**
 * What the operator has picked but not yet committed.
 *
 * A selection is a **preview**, never a write. This is the safeguard against
 * double-taps and phantom entries: a preset box records intent, and only the
 * explicit אישור button turns that intent into a pallet plus its point awards.
 */
type Selection =
  | { kind: 'preset'; palletSizeId: string; cartons: number; label: string }
  | { kind: 'custom'; cartons: number }
  | null;

interface PalletRaceAttribution {
  raceId: string;
  raceName: string;
  pointValue: number;
  totalPoints: number;
  perMemberPoints: number[];
}

/**
 * Pallet logging — a single-page, touch-first grid with an explicit confirm step.
 *
 * Design notes
 * ------------
 * **Two problems this shape solves.**
 *
 * 1. *The dropdown that closed itself.* The previous version had a size
 *    dropdown whose options were rebuilt on every render. The dashboard polls
 *    every 4 s and ticks a clock every second, so the open popup was dismissed
 *    almost immediately. There is no dropdown any more, and the batch view is
 *    frozen while the dialog is open (`useFrozenWhileOpen`), so polling cannot
 *    reach this subtree at all.
 *
 * 2. *Double-taps and phantom entries.* Tapping a preset used to log a pallet
 *    instantly. On a factory tablet that produced duplicate rows from a single
 *    hesitant tap. Now a tap only **selects**, and a dedicated אישור button
 *    commits. A `submitting` ref additionally guards against a double-fired
 *    confirm.
 *
 * The dialog stays open after a successful log, so a run of pallets is still
 * quick: select, confirm, select, confirm.
 */
export const AddPalletDialog = memo(function AddPalletDialog({
  open,
  batch: liveBatch,
  onClose,
  onSaved,
}: {
  open: boolean;
  batch: BatchView;
  onClose: () => void;
  onSaved: (view: BatchView) => void;
}) {
  /**
   * Hold the batch snapshot taken when the dialog opened. Polling re-renders the
   * dashboard every 4 s and the clock ticks every second; without this the
   * preset grid would be rebuilt continuously and any open control would be
   * disturbed.
   */
  const batch = useFrozenWhileOpen(liveBatch, open);

  const [note, setNote] = useState('');
  const [customCartons, setCustomCartons] = useState<number | ''>('');
  const [selection, setSelection] = useState<Selection>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<LoggedFeedback | null>(null);

  /** Hard guard against a double-fired confirm producing two pallets. */
  const inFlight = useRef(false);

  const activeMembers = useMemo(
    () => batch.members.filter((member) => member.isCurrentlyActive),
    [batch.members],
  );

  const sizes = useMemo(
    () => [...batch.palletSizes].sort((a, b) => a.sortOrder - b.sortOrder || a.cartons - b.cartons),
    [batch.palletSizes],
  );

  /**
   * Reset only when the dialog transitions to open. Depending on anything that
   * changes on every poll is what caused the old dropdown to reset mid-interaction.
   */
  useEffect(() => {
    if (!open) return;
    setNote('');
    setCustomCartons('');
    setSelection(null);
    setError(null);
    setFeedback(null);
    inFlight.current = false;
  }, [open]);

  const pointValue = batch.product.pointValue;
  const memberCount = activeMembers.length;
  const teamBlocked = memberCount === 0;
  const activeRaceCount = batch.activeRaceNames.length;

  /** Points a carton count will award, and the per-member share. */
  const preview = useCallback(
    (cartons: number) => {
      const total = computePalletPoints(cartons, pointValue);
      if (memberCount === 0) return { total, perMember: 0 };
      const split = splitPoints(
        cartons,
        pointValue,
        activeMembers.map((member) => member.workerId),
      );
      return { total, perMember: split.shares[0] ?? 0 };
    },
    [pointValue, memberCount, activeMembers],
  );

  const selectPreset = (sizeId: string, cartons: number, label: string) => {
    if (teamBlocked || submitting) return;
    setError(null);
    setSelection({ kind: 'preset', palletSizeId: sizeId, cartons, label });
  };

  const selectCustom = () => {
    if (typeof customCartons !== 'number' || customCartons <= 0) {
      setError(t('error.invalidCartons'));
      return;
    }
    setError(null);
    setSelection({ kind: 'custom', cartons: customCartons });
  };

  const cancelSelection = () => {
    setSelection(null);
    setError(null);
  };

  /** Commits the current selection. This is the only code path that writes. */
  const confirmSelection = async () => {
    if (!selection) return;
    // Both a React state flag and a ref: the ref closes the window between the
    // tap and the state update, which is where a double-tap would slip through.
    if (inFlight.current) return;

    if (teamBlocked) {
      setError(t('station.palletNoTeam'));
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const response = await api.post<{
        batch: BatchView;
        totalPoints: number;
        perMemberPoints: number[];
        pallet: { cartons: number };
        races: PalletRaceAttribution[];
      }>(`/api/batches/${batch.batch.id}/pallets`, {
        palletSizeId: selection.kind === 'preset' ? selection.palletSizeId : null,
        cartons: selection.cartons,
        note: note.trim() || null,
      });

      onSaved(response.batch);

      setFeedback({
        cartons: response.pallet.cartons,
        totalPoints: response.totalPoints,
        memberCount: response.perMemberPoints.length,
        perMember: response.perMemberPoints[0] ?? 0,
        raceCount: response.races.length,
      });

      // Clear the selection so the next pallet starts from a clean slate, and
      // clear the note because it described the pallet just logged.
      setSelection(null);
      setCustomCartons('');
      setNote('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('station.palletLogFailed'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const selectedPreview = selection ? preview(selection.cartons) : null;

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={t('station.addPalletTitle')}
      subtitle={`${batch.product.name} · ${batch.line.name} · ${formatDecimal(pointValue)} נק׳ לקרטון`}
      size="lg"
      dismissable={!submitting}
      footer={
        <>
          <span className="me-auto text-xs text-ink-muted">
            {feedback
              ? t('station.palletLogged', {
                  points: formatPoints(feedback.totalPoints),
                  count: formatInt(feedback.memberCount),
                })
              : t('station.palletConfirmHint')}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('common.close')}
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

      {teamBlocked ? (
        <div className="mb-4">
          <Alert tone="warning">{t('station.palletNoTeam')}</Alert>
        </div>
      ) : null}

      {/* Confirmation of the pallet just logged */}
      {feedback ? (
        <div className="mb-4 animate-slide-up rounded-2xl border border-live-300 bg-live-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="live" icon="✓">
              {t('station.palletLogged', {
                points: formatPoints(feedback.totalPoints),
                count: formatInt(feedback.memberCount),
              })}
            </Badge>
            <span className="numeric text-sm font-bold text-live-700">
              {formatInt(feedback.cartons)} {t('station.cartons')} · {formatPoints(feedback.perMember)} ×{' '}
              {formatInt(feedback.memberCount)}
            </span>
            {feedback.raceCount > 0 ? (
              <span className="badge badge-brand">
                {t('station.palletWillScore', { count: formatInt(feedback.raceCount) })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Team + race context, always visible before anything is committed */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-surface-line bg-surface-muted/60 px-3.5 py-2.5">
        <span className="stat-label">{t('station.team')}</span>
        <span className="badge badge-live">{formatInt(memberCount)}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {activeMembers.map((member) => (
            <span key={member.memberId} aria-hidden className="text-xl" title={member.fullName}>
              {member.emoji}
            </span>
          ))}
        </span>
        <span className="ms-auto text-xs font-bold text-ink-muted">
          {activeRaceCount > 0
            ? t('station.racesAttributionList', { races: batch.activeRaceNames.join(' · ') })
            : t('station.palletWillScoreNone')}
        </span>
      </div>

      {/* ---------------------------------------------------- preset grid */}
      <h3 className="mb-2 text-sm font-black text-ink">{t('station.palletQuickPick')}</h3>

      {sizes.length === 0 ? (
        <p className="mb-4 rounded-xl border border-dashed border-surface-line bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
          {t('station.palletNoSizes')}
        </p>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sizes.map((size) => {
            const { total, perMember } = preview(size.cartons);
            const isSelected =
              selection?.kind === 'preset' && selection.palletSizeId === size.id;

            return (
              <button
                key={size.id}
                type="button"
                disabled={teamBlocked || submitting}
                aria-pressed={isSelected}
                onClick={() => selectPreset(size.id, size.cartons, size.label)}
                className={[
                  'group relative flex min-h-[132px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-4',
                  'transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-200'
                    : 'border-live-200 bg-white hover:-translate-y-0.5 hover:border-live-500 hover:shadow-live',
                ].join(' ')}
              >
                <span
                  className={[
                    'badge absolute end-2 top-2 !px-1.5 !py-0.5 !text-[10px]',
                    isSelected ? 'badge-brand' : 'badge-neutral',
                  ].join(' ')}
                >
                  {isSelected ? `✓ ${t('station.palletSelectedBadge')}` : t('station.palletStandardBadge')}
                </span>

                <span aria-hidden className="text-2xl">
                  📦
                </span>
                <span className="text-sm font-bold text-ink-soft">{size.label}</span>
                <span className="numeric text-4xl font-black leading-none text-ink">
                  {formatInt(size.cartons)}
                </span>
                <span className="text-xs font-bold text-ink-muted">{t('station.cartons')}</span>

                <span className="mt-1 flex items-center gap-1.5">
                  <span className="numeric text-lg font-black text-live-600">+{formatPoints(total)}</span>
                  <span className="text-[11px] font-bold text-ink-muted">
                    {memberCount > 0
                      ? t('station.palletSplitPreview', {
                          count: formatInt(memberCount),
                          each: formatPoints(perMember),
                        })
                      : t('station.palletTapToSelect')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------- manual box */}
      <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden className="text-xl">
            ✏️
          </span>
          <h3 className="text-sm font-black text-ink">{t('station.palletCustomTitle')}</h3>
          <span className="text-xs text-ink-muted">{t('station.palletCustomHint')}</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <NumberInput
              size="lg"
              value={customCartons}
              onValueChange={setCustomCartons}
              min={1}
              max={10000}
              placeholder={t('station.palletCustomPlaceholder')}
              suffix={t('common.units')}
              disabled={teamBlocked || submitting}
            />
          </div>

          <Button
            variant="ghost"
            size="lg"
            onClick={selectCustom}
            disabled={
              teamBlocked ||
              submitting ||
              typeof customCartons !== 'number' ||
              customCartons <= 0 ||
              selection?.kind === 'custom'
            }
            icon="✏️"
          >
            {t('station.palletTapToSelect')}
          </Button>
        </div>

        {typeof customCartons === 'number' && customCartons > 0 ? (
          <p className="mt-2.5 text-sm font-bold text-brand-700">
            {formatInt(customCartons)} {t('station.cartons')} ={' '}
            <span className="numeric">{formatPoints(preview(customCartons).total)}</span> {t('station.points')}
            {memberCount > 0
              ? ` · ${t('station.palletSplitPreview', {
                  count: formatInt(memberCount),
                  each: formatPoints(preview(customCartons).perMember),
                })}`
              : ''}
          </p>
        ) : null}
      </div>

      {/* Note applies to the next pallet logged */}
      <div className="mt-5">
        <Field label={`${t('station.palletNote')} (${t('common.optional')})`} htmlFor="pallet-note">
          <Textarea
            id="pallet-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('station.palletNotePlaceholder')}
            disabled={submitting}
          />
        </Field>
      </div>

      {/* --------------------------------------------- confirmation bar */}
      {selection ? (
        <div className="sticky bottom-0 mt-4 animate-slide-up rounded-2xl border-2 border-brand-400 bg-brand-50 px-4 py-3.5 shadow-raised">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="stat-label">{t('station.palletSelected')}</p>
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="numeric text-2xl font-black text-ink">
                  {formatInt(selection.cartons)}
                </span>
                <span className="text-sm font-bold text-ink-soft">{t('station.cartons')}</span>
                {selection.kind === 'preset' ? (
                  <span className="text-sm font-bold text-ink-muted">· {selection.label}</span>
                ) : (
                  <span className="text-sm font-bold text-ink-muted">
                    · {t('station.palletCustomTitle')}
                  </span>
                )}
                <span className="numeric text-xl font-black text-live-600">
                  +{formatPoints(selectedPreview?.total ?? 0)}
                </span>
                <span className="text-xs font-bold text-ink-muted">
                  {activeRaceCount > 0
                    ? t('station.palletWillScore', { count: formatInt(activeRaceCount) })
                    : t('station.palletWillScoreNone')}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="lg"
                onClick={cancelSelection}
                disabled={submitting}
                icon="✕"
              >
                {t('station.palletCancel')}
              </Button>
              <Button
                variant="live"
                size="lg"
                onClick={() => void confirmSelection()}
                loading={submitting}
                disabled={teamBlocked}
                icon="✓"
              >
                {submitting ? t('station.palletSubmitting') : t('station.palletConfirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
});
