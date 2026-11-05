import type { Metadata } from 'next';
/*
 * Two faces (DESIGN.md § Typography). Inter sets the Latin; it has no Thai,
 * so the house stack falls through to Anuphan for Thai glyphs. Loaded once,
 * here, for every screen, from npm (@fontsource), so neither the build nor
 * the page ever asks a font CDN for anything. next/font/google was dropped
 * because it fetches at build time and depends on how Google answers the
 * building machine: the v1.1.0 release failed in CI on Anuphan URLs that
 * Turbopack could not parse. Each file carries its unicode-range, so a
 * browser downloads only the subsets a page uses. `--font-sans` and
 * `--font-read` are named in globals.css.
 */
import '@fontsource-variable/inter/wght.css';
import '@fontsource/anuphan/latin-400.css';
import '@fontsource/anuphan/latin-500.css';
import '@fontsource/anuphan/latin-600.css';
import '@fontsource/anuphan/thai-400.css';
import '@fontsource/anuphan/thai-500.css';
import '@fontsource/anuphan/thai-600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'T-Timeline',
  description: 'Plan and reality, booked side by side.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // There is no dark theme (DESIGN.md § Colors).
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
