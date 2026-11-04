const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const DEFAULT_PREFIX = '/api/doc-assets/';

function assetPattern(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(${UUID})(?![0-9a-f-])`, 'gi');
}

/** Collect private asset links from Markdown, rich JSON strings and settings.
 * `prefix` names the asset route — project Docs by default, the Wiki's own otherwise. */
export function docAssetIds(value: unknown, prefix = DEFAULT_PREFIX): Set<string> {
  const ids = new Set<string>();
  const pattern = assetPattern(prefix);
  function visit(item: unknown) {
    if (typeof item === 'string') {
      const text = item.replace(/\\\//g, '/');
      for (const match of text.matchAll(pattern)) ids.add(match[1]!.toLowerCase());
    } else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  }
  visit(value);
  return ids;
}

export function removedDocAssetIds(before: unknown, after: unknown, prefix = DEFAULT_PREFIX): string[] {
  const remaining = docAssetIds(after, prefix);
  return [...docAssetIds(before, prefix)].filter(id => !remaining.has(id));
}
