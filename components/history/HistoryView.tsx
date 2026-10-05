'use client';

import { useCallback, useMemo, useState } from 'react';

import type { BatchHistoryRow, Product, ProductionLine, Race, Worker } from '@/lib/domain/types';
import { formatClock, formatDate, formatDateTime, formatInt, formatPoints, formatRate } from '@/lib/domain/format';
import { lineLabel, pauseReasonLabel, t } from '@/lib/i18n/he';
import { api, downloadCsv } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, SectionHeader } from '@/components/ui/primitives';
import { Field, Select, TextInput } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';

interface HistoryBundle {
  rows: BatchHistoryRow[];
  workers: Worker[];
  products: Product[];
  races: Race[];
  lines: ProductionLine[];
}

/**
 * Shift history ledger.
 *
 * Filters are applied server-side so the browser never has to hold the whole
 * table. Expanding a row reveals the pause breakdown for that batch, which is
 * what supervisors use to argue about downtime at the end of a shift.
 */
export function HistoryView({
  initial,
  defaultFrom,
  defaultTo,
}: {
  initial: HistoryBundle;
  defaultFrom: string;
  defaultTo: string;
}) {
  const [bundle, setBundle] = useState<HistoryBundle>(initial);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [productId, setProductId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [lineId, setLineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchHistoryRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (productId) params.set('productId', productId);
      if (workerId) params.set('workerId', workerId);
      if (lineId) params.set('lineId', lineId);
      const next = await api.get<HistoryBundle>(`/api/history?${params.toString()}`);
      setBundle(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  }, [from, to, productId, workerId, lineId]);

  const totals = useMemo(() => {
    return bundle.rows.reduce(
      (accumulator, row) => ({
        points: accumulator.points + row.totalPoints,
        cartons: accumulator.cartons + row.totalCartons,
        pallets: accumulator.pallets + row.palletCount,
        activeSeconds: accumulator.activeSeconds + row.activeSeconds,
        pausedSeconds: accumulator.pausedSeconds + row.pausedSeconds,
      }),
      { points: 0, cartons: 0, pallets: 0, activeSeconds: 0, pausedSeconds: 0 },
    );
  }, [bundle.rows]);

  const exportHref = (report: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/api/reports/${report}?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <SectionHeader
        level={1}
        title={t('history.title')}
        subtitle={t('history.subtitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => downloadCsv(exportHref('batches'))} icon="⬇">
              {t('history.exportAll')}
            </Button>
            <Button variant="primary" onClick={reload} loading={loading} icon="↻">
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <section className="card card-pad mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('history.filterFrom')}>
            <TextInput type="date" freeText={false} value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label={t('history.filterTo')}>
            <TextInput type="date" freeText={false} value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label={t('history.filterProduct')}>
            <Select
              value={productId}
              placeholder={t('common.all')}
              onChange={(event) => setProductId(event.target.value)}
              options={bundle.products.map((product) => ({ value: product.id, label: product.name }))}
            />
          </Field>
          <Field label={t('history.filterWorker')}>
            <Select
              value={workerId}
              placeholder={t('common.all')}
              onChange={(event) => setWorkerId(event.target.value)}
              options={bundle.workers.map((worker) => ({
                value: worker.id,
                label: `${worker.emoji} ${worker.fullName}`,
              }))}
            />
          </Field>
          <Field label={t('station.line')}>
            <Select
              value={lineId}
              placeholder={t('common.all')}
              onChange={(event) => setLineId(event.target.value)}
              options={bundle.lines.map((line) => ({
                value: line.id,
                label: lineLabel(line.code, line.name),
              }))}
            />
          </Field>
          <div className="flex items-end">
            <Button variant="subtle" block onClick={reload} loading={loading}>
              {t('common.filter')}
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-5">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}

      {/* Range totals */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat label={t('history.count', { count: formatInt(bundle.rows.length) })} value="" />
        <MiniStat label={t('history.points')} value={formatPoints(totals.points)} tone="text-live-600" />
        <MiniStat label={t('history.cartons')} value={formatInt(totals.cartons)} />
        <MiniStat label={t('history.activeTime')} value={formatClock(totals.activeSeconds)} />
        <MiniStat label={t('history.pausedTime')} value={formatClock(totals.pausedSeconds)} tone="text-safety-600" />
      </div>

      {/* Ledger */}
      {bundle.rows.length === 0 ? (
        <EmptyState icon="🗂️" title={t('history.empty')} hint={t('history.emptyHint')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('history.product')}</th>
                <th>{t('station.line')}</th>
                <th>{t('history.startTime')}</th>
                <th>{t('history.finishTime')}</th>
                <th className="text-end">{t('history.elapsed')}</th>
                <th className="text-end">{t('history.activeTime')}</th>
                <th className="text-end">{t('history.pausedTime')}</th>
                <th className="text-end">{t('history.cartons')}</th>
                <th className="text-end">{t('history.points')}</th>
                <th>{t('history.team')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bundle.rows.map((row) => (
                <tr key={row.batch.id}>
                  <td className="numeric text-ink-soft">{formatDate(row.startedAt)}</td>
                  <td>
                    <span className="block font-bold text-ink">{row.product.name}</span>
                    <span className="block text-xs text-ink-muted">{row.product.sizeLabel}</span>
                  </td>
                  <td>
                    <Badge tone={row.line?.code === 'LINE_A' ? 'brand' : 'neutral'}>
                      {lineLabel(row.line?.code ?? '?', row.line?.name)}
                    </Badge>
                  </td>
                  <td className="numeric text-ink-soft">{formatDateTime(row.startedAt)}</td>
                  <td className="numeric text-ink-soft">{formatDateTime(row.finishedAt)}</td>
                  <td className="numeric text-end text-ink-soft">{formatClock(row.totalElapsedSeconds)}</td>
                  <td className="numeric text-end font-bold text-live-600">{formatClock(row.activeSeconds)}</td>
                  <td className="numeric text-end font-bold text-safety-600">{formatClock(row.pausedSeconds)}</td>
                  <td className="numeric text-end text-ink-soft">{formatInt(row.totalCartons)}</td>
                  <td className="numeric text-end font-black text-brand-600">{formatPoints(row.totalPoints)}</td>
                  <td>
                    <span className="flex flex-wrap items-center gap-1">
                      {row.members.map((member) => (
                        <span
                          key={member.workerId}
                          title={member.fullName}
                          className="flex items-center gap-1 rounded-lg border border-surface-line bg-surface-muted px-1.5 py-0.5 text-xs font-bold text-ink-soft"
                        >
                          <span aria-hidden>{member.emoji}</span>
                          {member.fullName}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <Button variant="subtle" size="sm" onClick={() => setDetail(row)}>
                      {t('history.details')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Row detail */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? detail.product.name : ''}
        subtitle={
          detail
            ? `${lineLabel(detail.line?.code ?? '?', detail.line?.name)} · ${formatDateTime(detail.startedAt)} → ${formatDateTime(detail.finishedAt)}`
            : ''
        }
        size="lg"
        footer={
          <Button variant="primary" onClick={() => setDetail(null)}>
            {t('common.close')}
          </Button>
        }
      >
        {detail ? (
          <>
            <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DetailStat label={t('history.elapsed')} value={formatClock(detail.totalElapsedSeconds)} />
              <DetailStat label={t('history.activeTime')} value={formatClock(detail.activeSeconds)} tone="live" />
              <DetailStat label={t('history.pausedTime')} value={formatClock(detail.pausedSeconds)} tone="paused" />
              <DetailStat label={t('history.points')} value={formatPoints(detail.totalPoints)} tone="brand" />
              <DetailStat label={t('history.cartons')} value={formatInt(detail.totalCartons)} />
              <DetailStat label={t('leaderboard.pallets')} value={formatInt(detail.palletCount)} />
              <DetailStat
                label={t('leaderboard.pph')}
                value={formatPoints(
                  detail.activeSeconds > 0 ? detail.totalPoints / (detail.activeSeconds / 3600) : 0,
                )}
                tone="live"
              />
              <DetailStat label={t('history.race')} value={detail.raceNames.join(' | ') || '—'} />
            </dl>

            <h3 className="mb-2 text-base font-black text-ink">{t('history.team')}</h3>
            <ul className="mb-5 flex flex-wrap gap-2">
              {detail.members.map((member) => (
                <li
                  key={member.workerId}
                  className="flex items-center gap-2 rounded-xl border border-surface-line bg-surface-muted px-3 py-2 text-sm"
                >
                  <span aria-hidden className="text-lg">
                    {member.emoji}
                  </span>
                  <span className="font-bold text-ink">{member.fullName}</span>
                  <span className="numeric text-xs text-ink-muted">#{member.employeeId}</span>
                </li>
              ))}
            </ul>

            <h3 className="mb-2 text-base font-black text-ink">{t('history.pauseBreakdown')}</h3>
            {detail.pauseBreakdown.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('common.empty')}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('station.pauseReason')}</th>
                      <th className="text-end">מספר אירועים</th>
                      <th className="text-end">{t('history.pausedTime')}</th>
                      <th className="text-end">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.pauseBreakdown.map((bucket) => (
                      <tr key={bucket.reasonCode}>
                        <td className="font-bold text-ink">
                          {bucket.reasonLabel ?? pauseReasonLabel(bucket.reasonCode)}
                        </td>
                        <td className="numeric text-end text-ink-soft">{formatInt(bucket.occurrences)}</td>
                        <td className="numeric text-end font-bold text-safety-600">
                          {formatClock(bucket.totalSeconds)}
                        </td>
                        <td className="numeric text-end text-ink-soft">{formatRate(bucket.share * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </Modal>
    </div>
  );
}

function MiniStat({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card card-pad">
      <span className="stat-label block">{label}</span>
      {value ? <span className={`numeric text-2xl font-black ${tone}`}>{value}</span> : null}
    </div>
  );
}

function DetailStat({ label, value, tone = 'ink' }: { label: string; value: string; tone?: string }) {
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
