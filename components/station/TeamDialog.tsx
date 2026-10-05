'use client';

import { useMemo, useState } from 'react';

import type { BatchView, Worker } from '@/lib/domain/types';
import { formatDateTime, formatPoints } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

/**
 * Mid-batch team modification.
 *
 * This is the screen that implements the fairness rule: when a worker is
 * removed, their membership interval is closed on the server. Every pallet
 * logged after that moment is split strictly among the remaining members, while
 * the points they already earned stay on their ledger untouched.
 *
 * The dialog makes the rule explicit, both in the explanatory banner and by
 * showing each member's points earned so far on this batch.
 */
export function TeamDialog({
  open,
  batch,
  workers,
  onClose,
  onSaved,
}: {
  open: boolean;
  batch: BatchView;
  workers: Worker[];
  onClose: () => void;
  onSaved: (view: BatchView) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);

  const activeMembers = useMemo(
    () => batch.members.filter((member) => member.isCurrentlyActive),
    [batch.members],
  );
  const activeWorkerIds = new Set(activeMembers.map((member) => member.workerId));

  const addable = workers.filter((worker) => !activeWorkerIds.has(worker.id));

  const addMember = async (workerId: string) => {
    setError(null);
    setBusyWorkerId(workerId);
    try {
      const response = await api.post<{ batch: BatchView }>(`/api/batches/${batch.batch.id}/members`, {
        workerId,
      });
      onSaved(response.batch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setBusyWorkerId(null);
    }
  };

  const removeMember = async (workerId: string) => {
    setError(null);
    setBusyWorkerId(workerId);
    try {
      const response = await api.delete<{ batch: BatchView }>(
        `/api/batches/${batch.batch.id}/members?workerId=${encodeURIComponent(workerId)}`,
      );
      onSaved(response.batch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setBusyWorkerId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('station.teamChange')}
      subtitle={batch.product.name}
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {error ? (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}

      <div className="mb-5">
        <Alert tone="warning">{t('station.teamChangeHint')}</Alert>
      </div>

      {/* Current team */}
      <section className="mb-6">
        <h3 className="mb-2 flex items-center gap-2 text-base font-black text-ink">
          <span aria-hidden>👷</span>
          {t('station.team')}
          <span className="badge badge-live">{activeMembers.length}</span>
        </h3>

        <ul className="grid gap-2 sm:grid-cols-2">
          {activeMembers.map((member) => (
            <li
              key={member.memberId}
              className="flex items-center justify-between gap-3 rounded-xl border border-live-200 bg-live-50/60 px-3.5 py-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="text-2xl leading-none">
                  {member.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">{member.fullName}</span>
                  <span className="numeric block text-xs text-ink-muted">
                    #{member.employeeId} · {formatPoints(member.points)} נק׳ באצווה
                  </span>
                </span>
              </span>

              <Button
                variant="ghost"
                size="sm"
                loading={busyWorkerId === member.workerId}
                disabled={activeMembers.length <= 1 || busyWorkerId !== null}
                onClick={() => removeMember(member.workerId)}
                title={activeMembers.length <= 1 ? t('error.teamEmpty') : t('station.teamRemove')}
              >
                {t('station.teamRemove')}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* Add a worker who joined the line */}
      <section className="mb-6">
        <h3 className="mb-2 flex items-center gap-2 text-base font-black text-ink">
          <span aria-hidden>➕</span>
          {t('station.teamAdd')}
        </h3>

        {addable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-surface-line bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
            כל העובדים הפעילים כבר נמצאים באצווה זו.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {addable.map((worker) => (
              <li
                key={worker.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-surface-line bg-white px-3.5 py-3"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="text-2xl leading-none">
                    {worker.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{worker.fullName}</span>
                    <span className="numeric block text-xs text-ink-muted">#{worker.employeeId}</span>
                  </span>
                </span>
                <Button
                  variant="live"
                  size="sm"
                  loading={busyWorkerId === worker.id}
                  disabled={busyWorkerId !== null}
                  onClick={() => addMember(worker.id)}
                  icon="＋"
                >
                  {t('common.add')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Attendance log for the batch */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-base font-black text-ink">
          <span aria-hidden>🕒</span>
          {t('station.teamHistory')}
        </h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('leaderboard.worker')}</th>
                <th>{t('station.joinedAt')}</th>
                <th>{t('station.leftAt')}</th>
                <th className="text-end">{t('station.points')}</th>
              </tr>
            </thead>
            <tbody>
              {batch.members.map((member) => (
                <tr key={member.memberId}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{member.emoji}</span>
                      <span className="font-bold">{member.fullName}</span>
                    </span>
                  </td>
                  <td className="numeric text-ink-soft">{formatDateTime(member.joinedAt)}</td>
                  <td className="text-ink-soft">
                    {member.leftAt ? (
                      <span className="numeric">{formatDateTime(member.leftAt)}</span>
                    ) : (
                      <span className="badge badge-live">{t('station.stillHere')}</span>
                    )}
                  </td>
                  <td className="numeric text-end font-black text-live-600">{formatPoints(member.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Modal>
  );
}
