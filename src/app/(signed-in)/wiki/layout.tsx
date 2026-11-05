/*
 * The wiki wears the house style, whose face is Inter. Inter is loaded once in
 * the root layout as `--font-sans`; the wiki's `--nt-sans` stack reaches it
 * through `--font-wiki` (globals.css) and falls through to Anuphan for Thai.
 */
export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
