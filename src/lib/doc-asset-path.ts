/** Storage naming is separate from the original filename shown on download. */
export function docAssetStorageKey(asset: { id: string; filename: string; createdAt: Date }): string {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(asset.id)) throw new Error('Invalid asset ID.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: '2-digit', month: '2-digit',
  }).formatToParts(asset.createdAt);
  const year = parts.find(part => part.type === 'year')!.value;
  const month = parts.find(part => part.type === 'month')!.value;
  const safe = asset.filename.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/, '');
  const extension = /\.[a-z0-9]{1,16}$/i.exec(safe)?.[0] ?? '';
  const stem = extension ? safe.slice(0, -extension.length) : safe;
  // Keep Thai names within both UTF-8 filesystem and Windows component limits.
  let basename = '';
  let bytes = 0;
  for (const character of stem) {
    bytes += new TextEncoder().encode(character).length;
    if (bytes > 160) break;
    basename += character;
  }
  return `${year}/${month}/${asset.id}-${basename || 'attachment'}${extension}`;
}
