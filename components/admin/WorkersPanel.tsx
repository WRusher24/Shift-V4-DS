'use client';

import { useMemo, useState } from 'react';

import type { Worker } from '@/lib/domain/types';
import { formatDate, formatInt } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, SectionHeader } from '@/components/ui/primitives';
import { EmojiPicker, Field, TextInput } from '@/components/ui/fields';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';

interface FormState {
  id: string | null;
  fullName: string;
  employeeId: string;
  emoji: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { id: null, fullName: '', employeeId: '', emoji: '', isActive: true };

/**
 * Worker management.
 *
 * The emoji uniqueness rule is enforced twice:
 *   - in the UI, taken emojis are struck through and unselectable;
 *   - on the server, with a clear Hebrew error if two admins race each other.
 *
 * Deleting a worker who already produced batches would break the payroll
 * ledger, so those workers are deactivated instead and the UI says so.
 */
export function WorkersPanel({ initialWorkers }: { initialWorkers: Worker[] }) {
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Worker | null>(null);
  const [search, setSearch] = useState('');

  const reload = async () => {
    const response = await api.get<{ workers: Worker[] }>('/api/workers?includeInactive=true');
    setWorkers(response.workers);
  };

  const takenEmojis = useMemo(
    () => workers.filter((worker) => worker.id !== form.id).map((worker) => worker.emoji),
    [workers, form.id],
  );

  const takenByLabel = (emoji: string) =>
    workers.find((worker) => worker.emoji === emoji && worker.id !== form.id)?.fullName ?? null;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return workers;
    return workers.filter(
      (worker) =>
        worker.fullName.toLowerCase().includes(needle) ||
        worker.employeeId.toLowerCase().includes(needle),
    );
  }, [workers, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (worker: Worker) => {
    setForm({
      id: worker.id,
      fullName: worker.fullName,
      employeeId: worker.employeeId,
      emoji: worker.emoji,
      isActive: worker.isActive,
    });
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setError(null);

    if (!form.fullName.trim() || !form.employeeId.trim() || !form.emoji) {
      setError('יש למלא שם מלא, מספר עובד ולבחור אימוג׳.');
      return;
    }
    if (takenEmojis.includes(form.emoji)) {
      setError(t('error.workerEmojiDuplicate'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        employeeId: form.employeeId.trim(),
        emoji: form.emoji,
        isActive: form.isActive,
      };

      if (form.id) {
        await api.patch(`/api/workers/${form.id}`, payload);
        setNotice(`${t('common.saved')} — ${payload.fullName}`);
      } else {
        await api.post('/api/workers', payload);
        setNotice(`${t('common.saved')} — ${payload.fullName}`);
      }

      await reload();
      setModalOpen(false);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setError(null);

    try {
      const result = await api.delete<{ deleted: boolean; deactivated: boolean }>(`/api/workers/${target.id}`);
      setNotice(result.deactivated ? t('admin.workers.deactivated') : t('admin.workers.deleted'));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  const toggleActive = async (worker: Worker) => {
    setError(null);
    try {
      await api.patch(`/api/workers/${worker.id}`, {
        fullName: worker.fullName,
        employeeId: worker.employeeId,
        emoji: worker.emoji,
        isActive: !worker.isActive,
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  const activeCount = workers.filter((worker) => worker.isActive).length;

  return (
    <div>
      <SectionHeader
        title={t('admin.workers.title')}
        subtitle={t('admin.workers.subtitle')}
        actions={
          <>
            <Badge tone="live">{t('admin.workers.count', { count: formatInt(activeCount) })}</Badge>
            <Button variant="primary" onClick={openCreate} icon="＋">
              {t('admin.workers.add')}
            </Button>
          </>
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

      <div className="mb-4 max-w-md">
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('admin.workers.searchPlaceholder')}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="👷"
          title={t('common.empty')}
          hint={t('station.noWorkers')}
          action={
            <Button variant="primary" onClick={openCreate} icon="＋">
              {t('admin.workers.add')}
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-16">{t('admin.workers.emoji')}</th>
                <th>{t('admin.workers.fullName')}</th>
                <th>{t('admin.workers.employeeId')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.date')}</th>
                <th className="text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((worker) => (
                <tr key={worker.id} className={worker.isActive ? '' : 'opacity-55'}>
                  <td>
                    <span
                      aria-hidden
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-surface-line bg-white text-xl"
                    >
                      {worker.emoji}
                    </span>
                  </td>
                  <td className="font-bold text-ink">{worker.fullName}</td>
                  <td className="numeric text-ink-soft">#{worker.employeeId}</td>
                  <td>
                    {worker.isActive ? (
                      <Badge tone="live">{t('common.active')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('common.inactive')}</Badge>
                    )}
                  </td>
                  <td className="numeric text-ink-muted">{formatDate(worker.createdAt)}</td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="subtle" size="sm" onClick={() => openEdit(worker)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(worker)}>
                        {worker.isActive ? t('admin.workers.deactivate') : t('admin.workers.reactivate')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setPendingDelete(worker)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={form.id ? t('admin.workers.edit') : t('admin.workers.add')}
        subtitle={t('admin.workers.emojiHint')}
        size="lg"
        dismissable={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={submit} loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {error ? (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.workers.fullName')} hint={t('admin.workers.fullNameHint')} required>
            <TextInput
              size="lg"
              value={form.fullName}
              onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
              placeholder={t('admin.workers.fullNamePlaceholder')}
              autoFocus
            />
          </Field>

          <Field label={t('admin.workers.employeeId')} required>
            <TextInput
              size="lg"
              freeText={false}
              inputMode="numeric"
              value={form.employeeId}
              onChange={(event) => setForm((previous) => ({ ...previous, employeeId: event.target.value }))}
              placeholder={t('admin.workers.employeeIdPlaceholder')}
            />
          </Field>
        </div>

        <Field label={t('admin.workers.emoji')} hint={t('admin.workers.emojiHint')} required>
          <EmojiPicker
            value={form.emoji}
            onChange={(emoji) => setForm((previous) => ({ ...previous, emoji }))}
            takenEmojis={takenEmojis}
            takenByLabel={takenByLabel}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-line bg-surface-muted/60 px-3.5 py-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={form.isActive}
            onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
          />
          <span className="text-sm font-bold text-ink">{t('admin.workers.active')}</span>
        </label>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('common.confirmDelete')}
        message={
          pendingDelete
            ? t('admin.workers.deleteConfirm', { name: `${pendingDelete.emoji} ${pendingDelete.fullName}` })
            : ''
        }
        confirmLabel={t('common.delete')}
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
