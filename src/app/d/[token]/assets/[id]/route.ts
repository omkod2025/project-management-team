import { readPublishedAsset } from '@/lib/doc-publish';
import { DomainError } from '@/lib/errors';
import { docAssetCsp } from '@/lib/doc-svg';

/**
 * A file belonging to a published page (spec 10 §8b).
 *
 * The authenticated endpoint at `/api/doc-assets/:id` is untouched and still
 * refuses everybody without a session. This is not a public version of it: it
 * is scoped to one token, and serves only files the page that token publishes
 * actually references. There is no route here that takes an asset id alone.
 *
 * Every refusal is a bare 404 with no body detail, for the same reason the
 * page is: a stranger must not be able to tell a wrong token from a revoked
 * one, or a real file they may not have from one that does not exist.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  try {
    const asset = await readPublishedAsset(token, id);
    return new Response(new Uint8Array(asset.data), {
      headers: {
        'content-type': asset.mime,
        ...(asset.mime === 'application/octet-stream'
          ? {
              'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))}`,
            }
          : {}),
        /* `private` even here: the URL carries the secret, so a shared cache
           holding it would outlive the revocation that is supposed to end it. */
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': docAssetCsp,
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (err) {
    if (err instanceof DomainError) return new Response('Not found.', { status: 404 });
    return new Response('File unavailable.', { status: 500 });
  }
}
