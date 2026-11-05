import { currentUserId } from '@/auth';
import { mustChangePassword } from '@/lib/admin';
import { DomainError } from '@/lib/errors';
import { docAssetCsp } from '@/lib/doc-svg';
import { readWikiAsset } from '@/lib/wiki-assets';

const encodeFilename = (name: string) =>
  encodeURIComponent(name).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));

/**
 * A wiki file, for a signed-in user who can see its wiki — anyone else gets
 * the same 404 as a missing file. SVG is served under the sandbox CSP, and an
 * attachment is always a download, never rendered.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new Response('Sign in first.', { status: 401 });
  if (await mustChangePassword(userId)) return new Response('Change your password first.', { status: 403 });
  try {
    const asset = await readWikiAsset(userId, (await params).id);
    return new Response(new Uint8Array(asset.data), {
      headers: {
        'content-type': asset.mime,
        ...(asset.mime === 'application/octet-stream'
          ? { 'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeFilename(asset.filename)}` }
          : {}),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': docAssetCsp,
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (err) {
    if (err instanceof DomainError) return Response.json(err.toJSON(), { status: err.status });
    return new Response('File unavailable.', { status: 500 });
  }
}
