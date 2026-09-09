import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const namespace = 'http://www.w3.org/2000/svg';

// This policy is part of the SVG storage contract, including direct navigation.
// Never inline uploaded SVG into the application DOM. Image rendering supports
// CSS, foreignObject, animation and embedded assets without enabling scripts.
export const docAssetCsp = "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

/** Validate an SVG document, not an element/CSS allowlist or HTML sanitizer. */
export function validateDocSvg(data: Uint8Array): string {
  const fail = () => { throw new Error('Use a valid SVG image.'); };
  let text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  // Exporters commonly include the SVG 1.1 public DTD. Remove declarations
  // without loading them; custom entity definitions/subsets are unsupported.
  text = text.replace(/<!DOCTYPE\s+svg(?:\s+PUBLIC\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')|\s+SYSTEM\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*'))?\s*>/g, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail();
  const doc = new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } }).parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || (root.namespaceURI && root.namespaceURI !== namespace)) fail();
  // Also accept SVG fragments exported without their default namespace.
  if (!root.namespaceURI) root.setAttribute('xmlns', namespace);
  let count = 0;
  function visit(node: Node, depth: number) {
    if (++count > 20000 || depth > 64) fail();
    if (![1, 3, 4, 7, 8].includes(node.nodeType)) fail();
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child, depth + 1);
  }
  for (let node = doc.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && node !== root) fail();
    if (node.nodeType === 3 && node.textContent?.trim()) fail();
    visit(node, 0);
  }
  // Drops the XML declaration, DTD and document-level processing instructions.
  return new XMLSerializer().serializeToString(root);
}
