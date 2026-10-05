import type { Metadata, Viewport } from 'next';

import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Root layout.
 *
 * `lang="he"` + `dir="rtl"` are set here, which is what makes the entire
 * application render right-to-left — including native form controls, select
 * dropdowns and scrollbars. No per-component `dir` attributes are needed.
 */
export const metadata: Metadata = {
  title: {
    default: 'שיפט — מערכת מעקב ייצור',
    template: '%s · שיפט',
  },
  description:
    'מערכת מעקב ייצור וגיימיפיקציה לקווי מילוי ואריזה — תיעוד אצוות, משטחים, נקודות ודירוג צוותים בזמן אמת.',
  applicationName: 'שיפט',
  other: {
    // Explicitly declare the Hebrew locale so browsers never substitute
    // localised digit shapes when formatting numbers.
    'content-language': 'he-IL',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        {/*
          Heebo is a Hebrew-first sans with excellent Latin digit shapes.
          Loaded via <link> rather than next/font so a network-less build never
          fails; the CSS font stack in globals.css provides a system fallback.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
