import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const namespace = 'http://www.w3.org/2000/svg';
const styleProperties = new Set('font-family font-size font-weight font-style font-variant letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline text-decoration fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit opacity color marker-start marker-mid marker-end filter clip-path clip-rule mask display visibility paint-order vector-effect shape-rendering text-rendering stop-color stop-opacity flood-color flood-opacity'.split(' '));
function staticStylesheet(css: string): boolean {
  // Deliberately bounded CSS subset; no at-rules, nesting, escapes, comments,
  // custom properties or fetching functions. Fragment references stay local.
  if (/[\\@<>\u0000-\u0008\u000b\u000c\u000e-\u001f]|\/\*/.test(css)) return false;
  let rest = css.trim();
  while (rest) {
    const rule = /^([.#\w\s,>+~*-]+)\{([^{}]*)\}/.exec(rest);
    if (!rule || !rule[1]?.trim()) return false;
    for (const declaration of (rule[2] ?? '').split(';')) {
      if (!declaration.trim()) continue;
      const colon = declaration.indexOf(':');
      if (colon < 1 || !styleProperties.has(declaration.slice(0, colon).trim().toLowerCase())) return false;
      const value = declaration.slice(colon+1).trim()
        .replace(/url\(\s*(?:"#[\w:.-]+"|'#[\w:.-]+'|#[\w:.-]+)\s*\)/gi, 'local')
        .replace(/(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)/gi, 'color');
      if (!value || !/^[\p{L}\p{N}\s#.,%'"!+-]+$/u.test(value)) return false;
    }
    rest = rest.slice(rule[0].length).trim();
  }
  return true;
}
const elements = new Set('svg g defs title desc path rect circle ellipse line polyline polygon text tspan textPath use symbol clipPath mask pattern marker linearGradient radialGradient stop filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence switch'.split(' '));

/** Static SVG only: no executable, embedded HTML or external resource content. */
export function validateDocSvg(data: Uint8Array): string {
  const fail = () => { throw new Error('Use a static SVG without scripts, embedded HTML, animations or external resources.'); };
  const text = new TextDecoder('utf-8', { fatal:true }).decode(data);
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(text)) fail();
  const doc = new DOMParser({ errorHandler: { warning:fail, error:fail, fatalError:fail } }).parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== namespace) fail();
  let count = 0;
  function visit(node: Node, depth: number) {
    if (++count > 20000 || depth > 64) fail();
    if (node.nodeType === 1) {
      const el = node as Element;
      if (el.namespaceURI !== namespace || (!elements.has(el.localName) && el.localName !== 'style')) fail();
      if (el.localName === 'style') {
        for (let child=el.firstChild; child; child=child.nextSibling) {
          if (![3,4].includes(child.nodeType)) fail();
        }
        if (!staticStylesheet(el.textContent ?? '')) fail();
      }
      for (let i=0; i<el.attributes.length; i++) {
        const attr = el.attributes.item(i)!;
        const name = attr.localName.toLowerCase(), value = attr.value.trim();
        if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
        if (attr.namespaceURI && attr.namespaceURI !== 'http://www.w3.org/1999/xlink' && attr.namespaceURI !== 'http://www.w3.org/XML/1998/namespace') fail();
        if (name.startsWith('on') || ['base','src'].includes(name)) fail();
        if (name === 'href' && !/^#[\w:.-]+$/.test(value)) fail();
        // Disallow CSS escapes/comments/imports and non-fragment URL references.
        if (/[\\@\u0000-\u001f]/.test(value) || /\/\*|javascript\s*:|data\s*:|expression\s*\(/i.test(value)) fail();
        const withoutLocalUrls = value.replace(/url\(\s*(?:"#[\w:.-]+"|'#[\w:.-]+'|#[\w:.-]+)\s*\)/gi, '');
        if (/url\s*\(/i.test(withoutLocalUrls)) fail();
      }
    } else if (![3,4,8].includes(node.nodeType)) fail();
    for (let c=node.firstChild; c; c=c.nextSibling) visit(c, depth+1);
  }
  // Reject extra roots and processing instructions; XML declaration is not content.
  for (let n=doc.firstChild; n; n=n.nextSibling) {
    if (n.nodeType === 7 && n.nodeName === 'xml') continue;
    if (n.nodeType === 1 && n !== root) fail();
    visit(n, 0);
  }
  return new XMLSerializer().serializeToString(root);
}
