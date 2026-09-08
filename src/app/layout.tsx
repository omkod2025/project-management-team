import type { Metadata } from 'next';
import { Bai_Jamjuree, Anuphan, Martian_Mono } from 'next/font/google';
import './globals.css';

/*
 * Three faces, each with a job no other could do (DESIGN.md § Typography).
 * next/font downloads and self-hosts them at build time, so there is no
 * request to a font CDN at runtime.
 */

const struct = Bai_Jamjuree({
  subsets: ['latin', 'thai'],
  weight: ['400', '600', '700'],
  variable: '--font-struct',
  display: 'swap',
});

const read = Anuphan({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600'],
  variable: '--font-read',
  display: 'swap',
});

const figure = Martian_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-figure',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'T-Timeline',
  description: 'Plan and reality, booked side by side.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The world is paper; there is no dark theme (DESIGN.md § Colors, rule 4).
    <html lang="en" className={`${struct.variable} ${read.variable} ${figure.variable}`}>
      <body>{children}</body>
    </html>
  );
}
