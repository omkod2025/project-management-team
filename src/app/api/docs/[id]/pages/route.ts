import { handle } from '@/lib/api';
import { createDocPage, loadDoc, restoreDocPage } from '@/lib/docs';
import { domainError } from '@/lib/errors';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req:Request,{params}:Context){return handle('Restore doc page',async userId=>{let body:unknown;try{body=await req.json();}catch{throw domainError('E_INVALID_DOC','Invalid page.');}return restoreDocPage(userId,(await params).id,body);});}
export async function GET(_req: Request, { params }: Context) {
  return handle('GET doc pages', async (userId) => loadDoc(userId, (await params).id));
}
export async function POST(req: Request, { params }: Context) {
  return handle('POST doc page', async (userId) => {
    let body: unknown;
    try { body = await req.json(); } catch { throw domainError('E_INVALID_DOC', 'Invalid page details.'); }
    return createDocPage(userId, (await params).id, body);
  });
}
