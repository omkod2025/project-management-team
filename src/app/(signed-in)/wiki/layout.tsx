/*
 * The wiki wears the house style, whose face is Inter. Inter is loaded once in
 * the root layout as `--font-sans`; the shared `.docs-book` skin (docs.css)
 * reads it through `--type-body-family` and falls through to Anuphan for Thai.
 */
export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
