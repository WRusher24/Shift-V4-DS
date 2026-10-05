'use client';

import { useMemo, useState } from 'react';

import type { ProductionLine } from '@/lib/domain/types';
import { formatInt } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, SectionHeader } from '@/components/ui/primitives';
import { Field, NumberInput, TextInput } from '@/components/ui/fields';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';

interface LineRow extends ProductionLine {
  /** True when the line currently has an ACTIVE batch. */
  running?: boolean;
}

interface FormState {
  id: string | null;
  name: string;
  code: string;
  sortOrder: number | '';
  isActive: boolean;
}

const EMPTY_FORM: FormState = { id: null, name: '', code: '', sortOrder: '', isActive: true };

/**
 * Production line management.
 *
 * Lines are fully dynamic — this panel is what turns the platform from a
 * two-line tool into one that matches the actual factory. The station dashboard
 * renders one live card per active line, in the order configured here.
 *
 * Deletion rules mirror workers and products: a line that already ran batches is
 * deactivated rather than removed, and a line that is *currently running* a batch
 * is refused outright — deleting it would orphan a live shift.
 */
export function LinesPanel({ initialLines }: { initialLines: LineRow[] }) {
  const [lines, setLines] = useState<LineRow[]>(initialLines);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LineRow | null>(null);

  const reload = async () => {
    const response = await api.get<{ lines: LineRow[] }>('/api/lines?includeInactive=true');
    setLines(response.lines);
  };

  const activeLines = useMemo(() => lines.filter((line) => line.isActive), [lines]);

  const openCreate = () => {
    // Pre-fill a sensible next code so the operator rarely has to type one.
    const used = new Set(lines.map((line) => line.code));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const nextLetter = letters.find((letter) => !used.has(`LINE_${letter}`)) ?? '';
    setForm({
      ...EMPTY_FORM,
      code: nextLetter ? `LINE_${nextLetter}` : '',
      name: nextLetter ? `קו ${nextLetter}` : '',
      sortOrder: lines.reduce((max, line) => Math.max(max, line.sortOrder), -1) + 1,
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (line: LineRow) => {
    setForm({
      id: line.id,
      name: line.name,
      code: line.code,
      sortOrder: line.sortOrder,
      isActive: line.isActive,
    });
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setError(null);

    if (!form.name.trim()) {
      setError('יש להזין שם לקו הייצור.');
      return;
    }
    if (!form.code.trim()) {
      setError('יש להזין קוד קצר לקו.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        ...(typeof form.sortOrder === 'number' ? { sortOrder: form.sortOrder } : {}),
        isActive: form.isActive,
      };

      if (form.id) await api.patch(`/api/lines/${form.id}`, payload);
      else await api.post('/api/lines', payload);

      setNotice(`${t('common.saved')} — ${payload.name}`);
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
      const result = await api.delete<{ deleted: boolean; deactivated: boolean }>(`/api/lines/${target.id}`);
      setNotice(result.deactivated ? t('admin.lines.deactivated') : t('admin.lines.deleted'));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  const toggleActive = async (line: LineRow) => {
    setError(null);
    try {
      await api.patch(`/api/lines/${line.id}`, { isActive: !line.isActive });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  /** Swaps a line with its neighbour and persists the whole order. */
  const move = async (line: LineRow, direction: -1 | 1) => {
    const ordered = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((candidate) => candidate.id === line.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const swapped = [...ordered];
    const [moved] = swapped.splice(index, 1);
    swapped.splice(targetIndex, 0, moved);

    setError(null);
    try {
      const response = await api.post<{ lines: ProductionLine[] }>('/api/lines/reorder', {
        ids: swapped.map((candidate) => candidate.id),
      });
      setLines(response.lines);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  return (
    <div>
      <SectionHeader
        title={t('admin.lines.title')}
        subtitle={t('admin.lines.subtitle')}
        actions={
          <>
            <Badge tone="live">
              {t('admin.lines.activeCount', { count: formatInt(activeLines.length) })}
            </Badge>
            <Button variant="primary" onClick={openCreate} icon="＋">
              {t('admin.lines.add')}
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

      {lines.length === 0 ? (
        <EmptyState
          icon="🏭"
          title={t('admin.lines.empty')}
          hint={t('admin.lines.emptyHint')}
          action={
            <Button variant="primary" onClick={openCreate} icon="＋">
              {t('admin.lines.add')}
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-24">{t('admin.lines.code')}</th>
                <th>{t('admin.lines.name')}</th>
                <th className="text-end">{t('admin.lines.sortOrder')}</th>
                <th>{t('common.status')}</th>
                <th className="text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className={line.isActive ? '' : 'opacity-55'}>
                  <td>
                    <span className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-surface-line bg-white px-2 text-sm font-black text-ink-soft">
                      {line.code}
                    </span>
                  </td>
                  <td>
                    <span className="block font-bold text-ink">{line.name}</span>
                    {line.running ? (
                      <span className="badge badge-live mt-1">{t('admin.lines.running')}</span>
                    ) : null}
                  </td>
                  <td className="numeric text-end text-ink-muted">{formatInt(line.sortOrder)}</td>
                  <td>
                    {line.isActive ? (
                      <Badge tone="live">{t('admin.lines.active')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('admin.lines.inactive')}</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void move(line, -1)}
                        title={t('admin.lines.moveUp')}
                        aria-label={t('admin.lines.moveUp')}
                      >
                        ▲
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void move(line, 1)}
                        title={t('admin.lines.moveDown')}
                        aria-label={t('admin.lines.moveDown')}
                      >
                        ▼
                      </Button>
                      <Button variant="subtle" size="sm" onClick={() => openEdit(line)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggleActive(line)}>
                        {line.isActive ? t('admin.lines.deactivate') : t('admin.lines.reactivate')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setPendingDelete(line)}>
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

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={form.id ? t('admin.lines.edit') : t('admin.lines.add')}
        subtitle={t('admin.lines.subtitle')}
        size="md"
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

        <Field label={t('admin.lines.name')} required>
          <TextInput
            size="lg"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder={t('admin.lines.namePlaceholder')}
            autoFocus
          />
        </Field>

        <Field label={t('admin.lines.code')} hint={t('admin.lines.codeHint')} required>
          <TextInput
            size="lg"
            freeText={false}
            value={form.code}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))
            }
            placeholder={t('admin.lines.codePlaceholder')}
          />
        </Field>

        <Field label={t('admin.lines.sortOrder')} hint="מספר נמוך יותר = קו מוצג ראשון">
          <NumberInput
            value={form.sortOrder}
            onValueChange={(value) => setForm((previous) => ({ ...previous, sortOrder: value }))}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-line bg-surface-muted/60 px-3.5 py-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={form.isActive}
            onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
          />
          <span className="text-sm font-bold text-ink">{t('admin.lines.isActive')}</span>
        </label>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('common.confirmDelete')}
        message={
          pendingDelete
            ? t('admin.lines.deleteConfirm', { name: `${pendingDelete.code} · ${pendingDelete.name}` })
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
