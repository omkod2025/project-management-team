/** Collect private asset links from Markdown, rich JSON strings and settings. */
export function docAssetIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  function visit(item: unknown) {
    if (typeof item === 'string') {
      const text = item.replace(/\\\//g, '/');
      for (const match of text.matchAll(/\/api\/doc-assets\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?![0-9a-f-])/gi)) ids.add(match[1]!.toLowerCase());
    } else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  }
  visit(value);
  return ids;
}

export function removedDocAssetIds(before: unknown, after: unknown): string[] {
  const remaining = docAssetIds(after);
  return [...docAssetIds(before)].filter(id => !remaining.has(id));
}
