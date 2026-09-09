import { handle } from '@/lib/api';
import { getDocTools, mutateDocTools } from '@/lib/doc-tools';
import { domainError } from '@/lib/errors';
export async function GET(_req: Request,{params}:{params:Promise<{id:string}>}) { return handle('GET doc tools',async userId=>getDocTools(userId,(await params).id)); }
export async function POST(req: Request,{params}:{params:Promise<{id:string}>}) { return handle('POST doc tools',async userId=>{
  let body: unknown; try {body=await req.json();} catch {throw domainError('E_INVALID_DOC','Invalid page action.');}
  return mutateDocTools(userId,(await params).id,body);
}); }
