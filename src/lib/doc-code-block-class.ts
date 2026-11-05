/**
 * Reproduces the `<code>` class that stock `CodeBlock.renderHTML`
 * (`@tiptap/extension-code-block`) puts on the content element when a
 * language is set: `languageClassPrefix + language`, or no class at all when
 * there is no language. `MermaidNodeView` (a `.tsx` file this module is kept
 * free of, so it can be imported from Node tests without a JSX transform)
 * calls this for its non-mermaid branch, so a plain code block's rendered
 * DOM stays identical to what the extension would have produced on its own.
 */
export function codeBlockLanguageClass(
  languageClassPrefix: unknown,
  language: unknown,
): string | undefined {
  if (!language) return undefined;
  return `${typeof languageClassPrefix === 'string' ? languageClassPrefix : ''}${String(language)}`;
}
