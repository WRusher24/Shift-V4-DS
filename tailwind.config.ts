import type { Config } from 'tailwindcss';

/**
 * Tailwind configuration for the "Shift" platform.
 *
 * RTL NOTES
 * ---------
 * This project is authored right-to-left first (`dir="rtl"` on <html>).
 * Physical spacing/positioning utilities (ml-, mr-, pl-, pr-, left-, right-,
 * text-left, text-right, border-l, border-r, rounded-l, rounded-r) MUST NOT be
 * used for layout that has a logical meaning. Always prefer the logical
 * equivalents:
 *
 *   ml-*  -> ms-*      mr-*  -> me-*
 *   pl-*  -> ps-*      pr-*  -> pe-*
 *   left-* -> start-*  right-* -> end-*
 *   text-left -> text-start    text-right -> text-end
 *   border-l -> border-s       border-r -> border-e
 *   rounded-l -> rounded-s     rounded-r -> rounded-e
 *
 * Tailwind CSS >= 3.3 ships all of these out of the box, so no plugin is
 * required — the rule is enforced by convention and by `npm run lint`.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Crisp industrial surfaces — deliberately light, never dark. */
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f4f6f9',
          sunken: '#e9edf3',
          line: '#d7dee8',
        },
        ink: {
          DEFAULT: '#0f172a',
          soft: '#334155',
          muted: '#64748b',
          faint: '#94a3b8',
        },
        /* Corporate blue = primary action / chrome. */
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
        /* Electric green = live counters, points, running state. */
        live: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        /* Safety amber/orange = pauses, downtime, warnings. */
        safety: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          300: '#fca5a5',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: [
          'Heebo',
          'Assistant',
          'Rubik',
          'Segoe UI',
          'Arial Hebrew',
          'Noto Sans Hebrew',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        /* Tabular numerals so timers and counters never jitter. */
        numeric: [
          'Heebo',
          'Inter',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        /* Floor-readable display sizes. */
        display: ['clamp(3rem, 7vw, 6.5rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-sm': ['clamp(2.25rem, 4.5vw, 3.75rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        huge: ['clamp(1.75rem, 2.6vw, 2.5rem)', { lineHeight: '1.15' }],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.18)',
        raised: '0 2px 4px 0 rgb(15 23 42 / 0.06), 0 18px 40px -18px rgb(15 23 42 / 0.28)',
        live: '0 0 0 1px rgb(16 185 129 / 0.35), 0 0 34px -6px rgb(16 185 129 / 0.55)',
        paused: '0 0 0 1px rgb(245 158 11 / 0.4), 0 0 34px -6px rgb(245 158 11 / 0.6)',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.62' },
        },
        'glow-live': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgb(16 185 129 / 0.35), 0 0 26px -8px rgb(16 185 129 / 0.5)' },
          '50%': { boxShadow: '0 0 0 1px rgb(16 185 129 / 0.55), 0 0 46px -4px rgb(16 185 129 / 0.75)' },
        },
        'glow-paused': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgb(245 158 11 / 0.4), 0 0 26px -8px rgb(245 158 11 / 0.5)' },
          '50%': { boxShadow: '0 0 0 1px rgb(245 158 11 / 0.65), 0 0 46px -4px rgb(245 158 11 / 0.8)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'ticker-in': {
          from: { opacity: '0', transform: 'translateY(28px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'bar-grow': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 1.6s ease-in-out infinite',
        'glow-live': 'glow-live 2.4s ease-in-out infinite',
        'glow-paused': 'glow-paused 1.8s ease-in-out infinite',
        'slide-up': 'slide-up 0.28s ease-out both',
        'ticker-in': 'ticker-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'bar-grow': 'bar-grow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'float-slow': 'float-slow 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
