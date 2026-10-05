'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Button                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'live' | 'safety' | 'danger' | 'ghost' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  live: 'btn-live',
  safety: 'btn-safety',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  subtle: 'btn-subtle',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: '',
  lg: 'btn-lg',
  xl: 'btn-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'btn',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? <Spinner /> : icon ? <span aria-hidden>{icon}</span> : null}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Spinner                                                                   */
/* -------------------------------------------------------------------------- */

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badge                                                                     */
/* -------------------------------------------------------------------------- */

export type BadgeTone = 'live' | 'paused' | 'brand' | 'neutral' | 'danger';

const TONE_CLASS: Record<BadgeTone, string> = {
  live: 'badge-live',
  paused: 'badge-paused',
  brand: 'badge-brand',
  neutral: 'badge-neutral',
  danger: 'badge-danger',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  pulse = false,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className={`badge ${TONE_CLASS[tone]}`}>
      {icon ? (
        <span aria-hidden className={pulse ? 'animate-pulse-live' : undefined}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat tile                                                                 */
/* -------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  unit,
  tone = 'default',
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: 'default' | 'live' | 'paused' | 'brand';
  icon?: ReactNode;
  hint?: string;
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
    <div className="card card-pad flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label">{label}</span>
        {icon ? (
          <span aria-hidden className="text-lg">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`stat-value ${toneClass}`}>{value}</span>
        {unit ? <span className="text-sm font-bold text-ink-muted">{unit}</span> : null}
      </div>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                               */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon = '📋',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-line bg-surface-muted/60 px-6 py-12 text-center">
      <span aria-hidden className="text-4xl">
        {icon}
      </span>
      <p className="text-base font-bold text-ink-soft">{title}</p>
      {hint ? <p className="max-w-md text-sm text-ink-muted">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Alert                                                                     */
/* -------------------------------------------------------------------------- */

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const ALERT_CLASS: Record<AlertTone, string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-800',
  success: 'border-live-200 bg-live-50 text-live-700',
  warning: 'border-safety-200 bg-safety-50 text-safety-700',
  error: 'border-danger-100 bg-danger-50 text-danger-700',
};

const ALERT_ICON: Record<AlertTone, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '⛔',
};

export function Alert({
  tone = 'info',
  children,
  onDismiss,
}: {
  tone?: AlertTone;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${ALERT_CLASS[tone]}`}
    >
      <span aria-hidden className="text-base leading-5">
        {ALERT_ICON[tone]}
      </span>
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="סגירה"
          className="rounded-md px-1 text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section header                                                            */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  title,
  subtitle,
  actions,
  level = 2,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Heading = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Heading className={level === 1 ? 'text-3xl font-black text-ink' : 'text-2xl font-black text-ink'}>
          {title}
        </Heading>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Progress bar                                                              */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  max,
  tone = 'brand',
  label,
}: {
  value: number;
  max: number;
  tone?: 'brand' | 'live' | 'paused';
  label?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const barClass =
    tone === 'live' ? 'bg-live-500' : tone === 'paused' ? 'bg-safety-500' : 'bg-brand-500';

  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full ${barClass} transition-[width] duration-500`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
