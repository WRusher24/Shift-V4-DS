'use client';

import { memo, useEffect, useMemo, useState } from 'react';

import type { PalletSize, Product, ProductionLine, Race, Worker } from '@/lib/domain/types';
import { formatDecimal, formatInt } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';
import { useFrozenWhileOpen } from '@/lib/client/hooks/useFrozenValue';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { CheckboxRow, Field, Textarea, TextInput } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';

/**
 * Batch setup workflow.
 *
 * Two steps only:
 *   1. pick the product being filled;
 *   2. tick the crew members starting on this batch.
 *
 * **There is no race to choose.** Every active batch contributes points to every
 * race that is ACTIVE at the moment each pallet is logged, so a batch is never
 * tied to a race and a race opened mid-shift starts scoring on the next pallet
 * automatically. The dialog only *reports* which races are currently open.
 *
 * Product selection uses a touch-friendly card grid with live search — no
 * native `<select>` dropdown, which was prone to closing on re-render.
 */
export const StartBatchDialog = memo(function StartBatchDialog({
  open,
  line,
  workers: liveWorkers,
  products: liveProducts,
  palletSizesByProduct: livePalletSizes,
  activeRaces,
  onClose,
  onStarted,
}: {
  open: boolean;
  line: ProductionLine;
  workers: Worker[];
  products: Product[];
  palletSizesByProduct: Record<string, PalletSize[]>;
  activeRaces: Race[];
  onClose: () => void;
  onStarted: () => void | Promise<void>;
}) {
  // Snapshots taken on open — polling must not disturb the open dialog.
  const workers = useFrozenWhileOpen(liveWorkers, open);
  const products = useFrozenWhileOpen(liveProducts, open);
  const palletSizesByProduct = useFrozenWhileOpen(livePalletSizes, open);

  const [productId, setProductId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [products, productId],
  );

  const sizes = productId ? (palletSizesByProduct[productId] ?? []) : [];

  // Filter products by search query (Hebrew, English, or SKU).
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const nameMatch = product.name.toLowerCase().includes(query);
      const skuMatch = product.sku?.toLowerCase().includes(query) ?? false;
      const sizeMatch = product.sizeLabel.toLowerCase().includes(query);
      return nameMatch || skuMatch || sizeMatch;
    });
  }, [products, searchQuery]);

  // Show first 6 products as quick-select when no search is active.
  const quickSelectProducts = useMemo(() => {
    if (searchQuery.trim()) return [];
    return products.slice(0, 6);
  }, [products, searchQuery]);

  const reset = () => {
    setProductId('');
    setMemberIds([]);
    setNotes('');
    setError(null);
    setSearchQuery('');
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const toggleMember = (workerId: string, checked: boolean) => {
    setMemberIds((previous) =>
      checked ? [...new Set([...previous, workerId])] : previous.filter((id) => id !== workerId),
    );
  };

  const selectProduct = (id: string) => {
    setProductId(id);
    setError(null);
  };

  const submit = async () => {
    setError(null);

    if (!productId) {
      setError('יש לבחור מוצר לפני פתיחת האצווה.');
      return;
    }
    if (memberIds.length === 0) {
      setError('יש לבחור לפחות עובד אחד לצוות.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/batches', {
        lineId: line.id,
        productId,
        memberIds,
        notes: notes.trim() || null,
      });
      reset();
      await onStarted();
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
      onClose={handleClose}
      title={`${t('station.setupTitle')} — ${line.name}`}
      subtitle={t('station.setupTeamHint')}
      size="lg"
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="live" onClick={submit} loading={saving} icon="▶">
            {t('station.setupSubmit')}
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

      {products.length === 0 ? (
        <Alert tone="warning">{t('station.noProducts')}</Alert>
      ) : (
        <>
          {/* Step 1 — product selection grid */}
          <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-black text-white">
                1
              </span>
              <h3 className="text-base font-black text-ink">{t('station.setupProduct')}</h3>
            </div>

            {/* Search input */}
            <div className="mb-4">
              <TextInput
                id="start-batch-product-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="חיפוש מוצר נוסף..."
                aria-label="חיפוש מוצר"
                className="w-full"
              />
            </div>

            {/* Quick-select cards (only when no search) */}
            {quickSelectProducts.length > 0 && (
              <div className="mb-3">
                <p className="stat-label mb-2">בחירה מהירה</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {quickSelectProducts.map((product) => {
                    const isSelected = product.id === productId;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => selectProduct(product.id)}
                        aria-pressed={isSelected}
                        className={[
                          'flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all',
                          isSelected
                            ? 'border-brand-500 bg-brand-100 ring-2 ring-brand-300'
                            : 'border-surface-line bg-white hover:border-brand-300 hover:bg-brand-50',
                        ].join(' ')}
                      >
                        <span className="block w-full truncate text-sm font-bold text-ink">
                          {product.name}
                        </span>
                        <span className="block w-full truncate text-xs text-ink-muted">
                          {product.sizeLabel}
                        </span>
                        <span className="numeric block text-xs font-semibold text-live-600">
                          {formatDecimal(product.pointValue)} נק׳ לקרטון
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search results / all products */}
            {searchQuery.trim() && (
              <div>
                <p className="stat-label mb-2">
                  {filteredProducts.length > 0
                    ? `${filteredProducts.length} תוצאות`
                    : 'לא נמצאו תוצאות'}
                </p>
                {filteredProducts.length > 0 ? (
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto scroll-thin sm:grid-cols-3">
                    {filteredProducts.map((product) => {
                      const isSelected = product.id === productId;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectProduct(product.id)}
                          aria-pressed={isSelected}
                          className={[
                            'flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all',
                            isSelected
                              ? 'border-brand-500 bg-brand-100 ring-2 ring-brand-300'
                              : 'border-surface-line bg-white hover:border-brand-300 hover:bg-brand-50',
                          ].join(' ')}
                        >
                          <span className="block w-full truncate text-sm font-bold text-ink">
                            {product.name}
                          </span>
                          <span className="block w-full truncate text-xs text-ink-muted">
                            {product.sizeLabel}
                          </span>
                          <span className="numeric block text-xs font-semibold text-live-600">
                            {formatDecimal(product.pointValue)} נק׳ לקרטון
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-surface-line bg-surface-muted/60 p-4 text-center text-sm text-ink-muted">
                    לא נמצאו מוצרים תואמים. נסו מילות חיפוש אחרות.
                  </p>
                )}
              </div>
            )}

            {/* Selected product details */}
            {selectedProduct ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-surface-line bg-white p-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="stat-label">נפח / גודל</dt>
                  <dd className="font-bold text-ink">{selectedProduct.sizeLabel}</dd>
                </div>
                <div>
                  <dt className="stat-label">קרטונים בפריסה</dt>
                  <dd className="numeric font-bold text-ink">{formatInt(selectedProduct.cartonsPerLayout)}</dd>
                </div>
                <div>
                  <dt className="stat-label">ערך לקרטון</dt>
                  <dd className="numeric font-bold text-live-600">
                    {formatDecimal(selectedProduct.pointValue)}
                  </dd>
                </div>
                <div>
                  <dt className="stat-label">גדלי משטח</dt>
                  <dd className="numeric font-bold text-ink">
                    {sizes.length > 0 ? sizes.map((size) => formatInt(size.cartons)).join(' / ') : '—'}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>

          {/* Step 2 — team */}
          <div className="rounded-2xl border border-live-200 bg-live-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-live-600 text-sm font-black text-white">
                  2
                </span>
                <h3 className="text-base font-black text-ink">{t('station.setupTeam')}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-live">
                  {t('station.setupTeamCount', { count: formatInt(memberIds.length) })}
                </span>
                <button
                  type="button"
                  className="text-xs font-bold text-brand-600 underline"
                  onClick={() => setMemberIds(workers.map((worker) => worker.id))}
                >
                  בחירת הכול
                </button>
                <button
                  type="button"
                  className="text-xs font-bold text-ink-muted underline"
                  onClick={() => setMemberIds([])}
                >
                  ניקוי
                </button>
              </div>
            </div>

            {workers.length === 0 ? (
              <Alert tone="warning">{t('station.noWorkers')}</Alert>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {workers.map((worker) => (
                  <CheckboxRow
                    key={worker.id}
                    checked={memberIds.includes(worker.id)}
                    onChange={(checked) => toggleMember(worker.id, checked)}
                    leading={worker.emoji}
                    label={worker.fullName}
                    description={`#${worker.employeeId}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Race context — informational only, nothing to configure */}
          <div className="mt-5 rounded-2xl border border-safety-200 bg-safety-50/50 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-lg">
                🏁
              </span>
              <h3 className="text-sm font-black text-ink">{t('station.racesAttribution')}</h3>
              {activeRaces.length > 0 ? (
                <Badge tone="paused">{t('admin.races.activeCount', { count: formatInt(activeRaces.length) })}</Badge>
              ) : (
                <Badge tone="danger" icon="⚠">
                  {t('station.noActiveRace')}
                </Badge>
              )}
            </div>

            {activeRaces.length > 0 ? (
              <p className="text-sm text-ink-soft">
                {t('station.racesAttributionList', {
                  races: activeRaces.map((race) => race.name).join(' · '),
                })}
              </p>
            ) : (
              <p className="text-sm text-ink-soft">{t('admin.races.noActive')}</p>
            )}
          </div>

          <div className="mt-5">
            <Field label={t('station.setupNotes')} htmlFor="start-batch-notes">
              <Textarea
                id="start-batch-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="לדוגמה: אצווה בוקר, קו מהיר"
                rows={2}
              />
            </Field>
          </div>
        </>
      )}
    </Modal>
  );
});
