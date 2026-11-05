import type { Metadata } from 'next';
import { Inter, Anuphan } from 'next/font/google';
import './globals.css';

/*
 * Two faces (DESIGN.md § Typography). Inter sets the Latin; it has no Thai,
 * so the house stack falls through to Anuphan for Thai glyphs. Loaded once,
 * here, for every screen. next/font downloads and self-hosts them at build
 * time, so there is no request to a font CDN at runtime.
 */

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const read = Anuphan({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600'],
  variable: '--font-read',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'T-Timeline',
  description: 'Plan and reality, booked side by side.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // There is no dark theme (DESIGN.md § Colors).
    <html lang="en" className={`${sans.variable} ${read.variable}`}>
      <body>{children}</body>
    </html>
  );
}
