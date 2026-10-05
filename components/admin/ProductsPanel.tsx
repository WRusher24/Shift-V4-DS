'use client';

import { useMemo, useState } from 'react';

import type { PalletSize, Product } from '@/lib/domain/types';
import { formatDecimal, formatInt } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, SectionHeader } from '@/components/ui/primitives';
import { Field, NumberInput, TextInput } from '@/components/ui/fields';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';

interface PalletSizeDraft {
  id?: string;
  label: string;
  cartons: number | '';
}

interface FormState {
  id: string | null;
  name: string;
  sku: string;
  sizeLabel: string;
  cartonsPerLayout: number | '';
  pointValue: number | '';
  isActive: boolean;
  palletSizes: PalletSizeDraft[];
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  sku: '',
  sizeLabel: '',
  cartonsPerLayout: 12,
  pointValue: 1,
  isActive: true,
  palletSizes: [{ label: 'משטח A', cartons: 28 }],
};

/**
 * Product & pallet configuration.
 *
 * Per SKU the supervisor defines the bottle/gallon size, the carton layout, the
 * per-carton **point value multiplier** (so harder products earn more), and one
 * or more predefined pallet sizes — which is what operators pick from when they
 * tap "+ הוסף משטח" on the floor.
 */
export function ProductsPanel({
  initialProducts,
  initialPalletSizes,
}: {
  initialProducts: Product[];
  initialPalletSizes: PalletSize[];
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [palletSizes, setPalletSizes] = useState<PalletSize[]>(initialPalletSizes);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const reload = async () => {
    const response = await api.get<{ products: Product[]; palletSizes: PalletSize[] }>(
      '/api/products?includeInactive=true',
    );
    setProducts(response.products);
    setPalletSizes(response.palletSizes);
  };

  const sizesByProduct = useMemo(() => {
    const grouped: Record<string, PalletSize[]> = {};
    for (const size of palletSizes) {
      const list = grouped[size.productId] ?? [];
      list.push(size);
      grouped[size.productId] = list;
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.cartons - b.cartons);
    }
    return grouped;
  }, [palletSizes]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setForm({
      id: product.id,
      name: product.name,
      sku: product.sku ?? '',
      sizeLabel: product.sizeLabel,
      cartonsPerLayout: product.cartonsPerLayout,
      pointValue: product.pointValue,
      isActive: product.isActive,
      palletSizes: (sizesByProduct[product.id] ?? []).map((size) => ({
        id: size.id,
        label: size.label,
        cartons: size.cartons,
      })),
    });
    setError(null);
    setModalOpen(true);
  };

  const updateSize = (index: number, patch: Partial<PalletSizeDraft>) => {
    setForm((previous) => ({
      ...previous,
      palletSizes: previous.palletSizes.map((size, position) =>
        position === index ? { ...size, ...patch } : size,
      ),
    }));
  };

  const addSize = () => {
    setForm((previous) => ({
      ...previous,
      palletSizes: [
        ...previous.palletSizes,
        { label: `משטח ${String.fromCharCode(65 + previous.palletSizes.length)}`, cartons: '' },
      ],
    }));
  };

  const removeSize = (index: number) => {
    setForm((previous) => ({
      ...previous,
      palletSizes: previous.palletSizes.filter((_, position) => position !== index),
    }));
  };

  const submit = async () => {
    setError(null);

    if (!form.name.trim() || !form.sizeLabel.trim()) {
      setError('יש למלא שם מוצר ונפח.');
      return;
    }
    if (!form.cartonsPerLayout || form.cartonsPerLayout <= 0) {
      setError('מספר הקרטונים בפריסה חייב להיות גדול מ-0.');
      return;
    }
    if (!form.pointValue || form.pointValue <= 0) {
      setError('ערך הנקודות לקרטון חייב להיות גדול מ-0.');
      return;
    }

    const cleanedSizes = form.palletSizes
      .filter((size) => size.label.trim() && size.cartons !== '' && Number(size.cartons) > 0)
      .map((size, index) => ({
        ...(size.id ? { id: size.id } : {}),
        label: size.label.trim(),
        cartons: Number(size.cartons),
        sortOrder: index,
      }));

    const duplicates = new Set(cleanedSizes.map((size) => size.cartons));
    if (duplicates.size !== cleanedSizes.length) {
      setError('לא ניתן להגדיר שני גדלי משטח עם אותו מספר קרטונים.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        sizeLabel: form.sizeLabel.trim(),
        cartonsPerLayout: Number(form.cartonsPerLayout),
        pointValue: Number(form.pointValue),
        isActive: form.isActive,
        palletSizes: cleanedSizes,
      };

      if (form.id) await api.patch(`/api/products/${form.id}`, payload);
      else await api.post('/api/products', payload);

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
      const result = await api.delete<{ deleted: boolean; deactivated: boolean }>(`/api/products/${target.id}`);
      setNotice(result.deactivated ? t('admin.products.deactivated') : t('admin.products.deleted'));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    }
  };

  return (
    <div>
      <SectionHeader
        title={t('admin.products.title')}
        subtitle={t('admin.products.subtitle')}
        actions={
          <>
            <Badge tone="brand">{t('admin.products.count', { count: formatInt(products.length) })}</Badge>
            <Button variant="primary" onClick={openCreate} icon="＋">
              {t('admin.products.add')}
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

      {products.length === 0 ? (
        <EmptyState
          icon="🧴"
          title={t('station.noProducts')}
          action={
            <Button variant="primary" onClick={openCreate} icon="＋">
              {t('admin.products.add')}
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.products.name')}</th>
                <th>{t('admin.products.sku')}</th>
                <th>{t('admin.products.sizeLabel')}</th>
                <th className="text-end">{t('admin.products.cartonsPerLayout')}</th>
                <th className="text-end">{t('admin.products.pointValue')}</th>
                <th>{t('admin.products.palletSizes')}</th>
                <th>{t('common.status')}</th>
                <th className="text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className={product.isActive ? '' : 'opacity-55'}>
                  <td className="font-bold text-ink">{product.name}</td>
                  <td className="text-ink-muted">{product.sku ?? '—'}</td>
                  <td className="text-ink-soft">{product.sizeLabel}</td>
                  <td className="numeric text-end text-ink-soft">{formatInt(product.cartonsPerLayout)}</td>
                  <td className="numeric text-end font-black text-live-600">
                    {formatDecimal(product.pointValue)}
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {(sizesByProduct[product.id] ?? []).map((size) => (
                        <span
                          key={size.id}
                          className="numeric rounded-lg border border-surface-line bg-surface-muted px-2 py-0.5 text-xs font-bold text-ink-soft"
                        >
                          {size.label}: {formatInt(size.cartons)}
                        </span>
                      ))}
                      {(sizesByProduct[product.id] ?? []).length === 0 ? (
                        <span className="text-xs text-ink-faint">{t('admin.products.noPalletSizes')}</span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    {product.isActive ? (
                      <Badge tone="live">{t('common.active')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('common.inactive')}</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="subtle" size="sm" onClick={() => openEdit(product)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setPendingDelete(product)}>
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
        title={form.id ? t('admin.products.edit') : t('admin.products.add')}
        subtitle={t('admin.products.palletSizesHint')}
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
          <Field label={t('admin.products.name')} required>
            <TextInput
              size="lg"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              placeholder={t('admin.products.namePlaceholder')}
              autoFocus
            />
          </Field>

          <Field label={t('admin.products.sku')}>
            <TextInput
              size="lg"
              freeText={false}
              value={form.sku}
              onChange={(event) => setForm((previous) => ({ ...previous, sku: event.target.value }))}
              placeholder="FLR-1L"
            />
          </Field>

          <Field label={t('admin.products.sizeLabel')} required>
            <TextInput
              size="lg"
              value={form.sizeLabel}
              onChange={(event) => setForm((previous) => ({ ...previous, sizeLabel: event.target.value }))}
              placeholder={t('admin.products.sizeLabelPlaceholder')}
            />
          </Field>

          <Field label={t('admin.products.cartonsPerLayout')} required>
            <NumberInput
              size="lg"
              value={form.cartonsPerLayout}
              onValueChange={(value) => setForm((previous) => ({ ...previous, cartonsPerLayout: value }))}
              suffix={t('common.units')}
            />
          </Field>

          <Field
            label={t('admin.products.pointValue')}
            hint={t('admin.products.pointValueHint')}
            required
          >
            <NumberInput
              size="lg"
              integer={false}
              value={form.pointValue}
              onValueChange={(value) => setForm((previous) => ({ ...previous, pointValue: value }))}
              suffix="נק׳"
            />
          </Field>

          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-surface-line bg-surface-muted/60 px-3.5 py-3.5">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={form.isActive}
                onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
              />
              <span className="text-sm font-bold text-ink">{t('common.active')}</span>
            </label>
          </div>
        </div>

        {/* Pallet sizes */}
        <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-ink">{t('admin.products.palletSizes')}</h3>
              <p className="text-xs text-ink-muted">{t('admin.products.palletSizesHint')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={addSize} icon="＋">
              {t('admin.products.addPalletSize')}
            </Button>
          </div>

          {form.palletSizes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-surface-line bg-white px-4 py-3 text-sm text-ink-muted">
              {t('admin.products.noPalletSizes')}
            </p>
          ) : (
            <ul className="space-y-2">
              {form.palletSizes.map((size, index) => (
                <li key={size.id ?? `new-${index}`} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label={t('admin.products.palletLabel')}>
                      <TextInput
                        value={size.label}
                        onChange={(event) => updateSize(index, { label: event.target.value })}
                        placeholder="משטח A"
                      />
                    </Field>
                  </div>
                  <div className="w-32">
                    <Field label={t('admin.products.palletCartons')}>
                      <NumberInput
                        value={size.cartons}
                        onValueChange={(value) => updateSize(index, { cartons: value })}
                        placeholder="28"
                      />
                    </Field>
                  </div>
                  <div className="pb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSize(index)}
                      aria-label={`${t('common.delete')} ${size.label}`}
                    >
                      ✕
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('common.confirmDelete')}
        message={pendingDelete ? t('admin.products.deleteConfirm', { name: pendingDelete.name }) : ''}
        confirmLabel={t('common.delete')}
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
