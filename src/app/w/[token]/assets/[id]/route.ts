import { DomainError } from '@/lib/errors';
import { docAssetCsp } from '@/lib/doc-svg';
import { readPublishedWikiAsset } from '@/lib/wiki-publish';

const encodeFilename = (name: string) =>
  encodeURIComponent(name).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));

/**
 * A file belonging to a published wiki (wiki spec §5b).
 *
 * `/api/wiki-assets/:id` is untouched and still demands a session. This route
 * is scoped to one token and serves only files a non-archived page of that
 * wiki references. Every refusal is the same bare 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  try {
    const asset = await readPublishedWikiAsset(token, id);
    return new Response(new Uint8Array(asset.data), {
      headers: {
        'content-type': asset.mime,
        ...(asset.mime === 'application/octet-stream'
          ? { 'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeFilename(asset.filename)}` }
          : {}),
        /* The URL carries the secret, so no shared cache may hold it past a revocation. */
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': docAssetCsp,
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    if (err instanceof DomainError) return new Response('Not found.', { status: 404 });
    return new Response('File unavailable.', { status: 500 });
  }
}
