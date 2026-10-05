'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { EMOJI_PALETTE } from '@/lib/i18n/he';
import { toWesternDigits } from '@/lib/domain/format';

/* -------------------------------------------------------------------------- */
/*  Field wrapper                                                             */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ms-1 text-danger-500">*</span> : null}
      </label>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-danger-600">{error}</span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Text input                                                                */
/* -------------------------------------------------------------------------- */

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Applies `unicode-bidi: plaintext` so mixed Hebrew/Arabic/English types cleanly. */
  freeText?: boolean;
  size?: 'md' | 'lg';
}

export function TextInput({ freeText = true, size = 'md', className = '', ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      dir={freeText ? 'auto' : rest.dir}
      className={[`input ${size === 'lg' ? 'input-lg' : ''}`, freeText ? 'input-free-text' : '', className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Numeric input                                                             */
/* -------------------------------------------------------------------------- */

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'size'> {
  value: number | '';
  onValueChange: (value: number | '') => void;
  integer?: boolean;
  suffix?: string;
  size?: 'md' | 'lg';
}

/**
 * Numeric field that guarantees Western digits.
 *
 * Two protections are layered:
 *   1. `inputMode="numeric"` asks tablets for a numeric keypad.
 *   2. Every keystroke is normalised through `toWesternDigits`, so an operator
 *      typing on an Arabic or Hebrew keyboard layout still stores `28` and never
 *      `٢٨` or `۲۸`.
 *
 * Forwarded ref so callers can return focus to the field after a submission —
 * essential when a crew is logging a run of pallets back to back.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, integer = true, suffix, size = 'md', className = '', ...rest },
  ref,
) {
  const handleChange = (raw: string) => {
    let normalized = toWesternDigits(raw).replace(/[^\d.]/g, '');
    if (integer) normalized = normalized.replace(/\./g, '');

    // Collapse multiple decimal points.
    const parts = normalized.split('.');
    if (parts.length > 2) normalized = `${parts[0]}.${parts.slice(1).join('')}`;

    if (normalized === '') {
      onValueChange('');
      return;
    }

    const parsed = integer ? Number.parseInt(normalized, 10) : Number.parseFloat(normalized);
    onValueChange(Number.isFinite(parsed) ? parsed : '');
  };

  return (
    <div className="relative">
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        dir="ltr"
        value={value === '' ? '' : String(value)}
        onChange={(event) => handleChange(event.target.value)}
        className={[`input numeric ${size === 'lg' ? 'input-lg' : ''}`, suffix ? 'pe-12' : '', className]
          .filter(Boolean)
          .join(' ')}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-bold text-ink-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  Select                                                                    */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  placeholder?: string;
  size?: 'md' | 'lg';
}

export function Select({ options, placeholder, size = 'md', className = '', ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={[`select ${size === 'lg' ? 'input-lg' : ''}`, className].filter(Boolean).join(' ')}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/*  Textarea                                                                  */
/* -------------------------------------------------------------------------- */

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} dir="auto" className={`input input-free-text min-h-[84px] ${className}`} />;
}

/* -------------------------------------------------------------------------- */
/*  Checkbox row                                                              */
/* -------------------------------------------------------------------------- */

export function CheckboxRow({
  checked,
  onChange,
  label,
  description,
  leading,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors',
        checked ? 'border-brand-400 bg-brand-50' : 'border-surface-line bg-white hover:bg-surface-muted',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-brand-600"
      />
      {leading ? <span aria-hidden className="text-2xl leading-none">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{label}</span>
        {description ? <span className="block text-xs text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Emoji picker                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Emoji picker with live collision feedback.
 *
 * Emojis already assigned to another worker are visually struck through and
 * unclickable, so the uniqueness rule is obvious before the user even submits.
 */
export function EmojiPicker({
  value,
  onChange,
  takenEmojis,
  takenByLabel,
}: {
  value: string;
  onChange: (emoji: string) => void;
  takenEmojis: string[];
  takenByLabel: (emoji: string) => string | null;
}) {
  const taken = new Set(takenEmojis);

  return (
    <div className="rounded-xl border border-surface-line bg-surface-muted/60 p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="stat-label">האימוג׳ הנבחר</span>
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-200 bg-white text-2xl"
        >
          {value || '—'}
        </span>
        {value && taken.has(value) ? (
          <span className="text-xs font-bold text-danger-600">
            תפוס על ידי {takenByLabel(value) ?? 'עובד אחר'}
          </span>
        ) : null}
      </div>

      <div className="grid max-h-56 grid-cols-8 gap-1.5 overflow-y-auto scroll-thin sm:grid-cols-12">
        {EMOJI_PALETTE.map((emoji) => {
          const isTaken = taken.has(emoji);
          const isSelected = value === emoji;
          return (
            <button
              key={emoji}
              type="button"
              disabled={isTaken}
              title={isTaken ? `תפוס — ${takenByLabel(emoji) ?? ''}` : emoji}
              onClick={() => onChange(emoji)}
              aria-pressed={isSelected}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-transform',
                isSelected
                  ? 'border-brand-500 bg-brand-100 ring-2 ring-brand-300'
                  : isTaken
                    ? 'cursor-not-allowed border-surface-line bg-surface-sunken opacity-35'
                    : 'border-surface-line bg-white hover:-translate-y-0.5 hover:border-brand-300',
              ].join(' ')}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          );
        })}
      </div>
      <p className="hint">אימוג׳ים כהים/מסומנים כבר בשימוש אצל עובד אחר ואינם ניתנים לבחירה.</p>
    </div>
  );
}
