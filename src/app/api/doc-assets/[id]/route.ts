import { currentUserId } from '@/auth';
import { mustChangePassword } from '@/lib/admin';
import { readDocAsset } from '@/lib/doc-assets';
import { DomainError } from '@/lib/errors';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new Response('Sign in first.', { status: 401 });
  if (await mustChangePassword(userId)) return new Response('Change your password first.', { status: 403 });
  try {
    const asset = await readDocAsset(userId, (await params).id);
    return new Response(new Uint8Array(asset.data), { headers: { 'content-type': asset.mime,
      ...(asset.mime === 'application/octet-stream' ? { 'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))}` } : {}),
      'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" } });
  } catch (err) {
    if (err instanceof DomainError) return Response.json(err.toJSON(), { status: err.status });
    return new Response('File unavailable.', { status: 500 });
  }
}
