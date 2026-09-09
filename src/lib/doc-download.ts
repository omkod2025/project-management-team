export function isDocAssetLink(href: string): boolean {
  return /^\/api\/doc-assets\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(href);
}

export function downloadFilename(disposition: string | null): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded).replace(/[\u0000-\u001f\u007f/\\]/g, '_'); }
    catch { /* Fall back to the server's ASCII filename. */ }
  }
  return disposition?.match(/filename="([^"]+)"/i)?.[1]?.replace(/[\u0000-\u001f\u007f/\\]/g, '_') || 'download';
}

/** Fetch before downloading: errors stay in the editor and unsaved text never
 * navigates away. The authenticated asset endpoint still controls access. */
export async function downloadDocFile(href: string) {
  if (!isDocAssetLink(href)) throw new Error('Invalid attachment link.');
  const response = await fetch(href, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to download this file.' : 'File unavailable or you no longer have access.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = downloadFilename(response.headers.get('content-disposition'));
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
