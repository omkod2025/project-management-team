import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import pg from 'pg';
import { encodeRich } from '../src/lib/doc-rich-content.ts';
import { parsePageContent } from '../src/lib/doc-rules.ts';

// One-off import into the new document explicitly created for this source file.
const source = 'c:/cit/works/pokpong-agent/docs/Bannayuu Next Doc Overview-20260908164830.html';
const docId = 'f012c34c-15fb-45a7-9a5d-2af2225c5486';
const html = fs.readFileSync(source, 'utf8').replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*?)(?:\s*\/)?\s*>/gi, '<$1$2/>');
const dom = new DOMParser().parseFromString(html, 'text/html');
const root = Array.from(dom.getElementsByTagName('div')).find(e => e.getAttribute('class') === 'page-0');
if (!root) throw new Error('Missing exported document body');
const children = n => Array.from(n.childNodes ?? []);
const block = (type, content, attrs) => ({ type, ...(attrs ? { attrs } : {}), content });
function pack(nodes) {
  const out = []; let inline = [];
  const flush = () => { if (inline.length) { out.push(block('paragraph', inline)); inline = []; } };
  for (const n of nodes) {
    if (['text', 'hardBreak'].includes(n.type)) inline.push(n);
    else { flush(); out.push(n); }
  }
  flush(); return out;
}
function convert(n, marks = []) {
  if (n.nodeType === 3) return n.data ? [{ type: 'text', text: n.data, ...(marks.length ? { marks } : {}) }] : [];
  if (n.nodeType !== 1) return [];
  const tag = n.tagName.toLowerCase(), cls = n.getAttribute('class') || '';
  if (['script', 'style', 'svg', 'colgroup'].includes(tag)) return [];
  const mark = { strong:'bold', b:'bold', em:'italic', i:'italic', u:'underline', s:'strike', del:'strike', code:'code' }[tag];
  if (mark && !marks.some(m => m.type === mark)) marks = [...marks, { type:mark }];
  const href = n.getAttribute('href');
  if (tag === 'a' && href && !href.startsWith('#')) marks = [...marks.filter(m => m.type !== 'link'), { type:'link', attrs:{ href } }];
  if (tag === 'br') return [{ type:'hardBreak' }];
  if (tag === 'hr') return [{ type:'horizontalRule' }];
  if (tag === 'img') {
    const src = n.getAttribute('src');
    return src ? [{ type:'image', attrs:{ src, alt:n.getAttribute('alt') || '' } }] : [];
  }
  const nested = children(n).flatMap(c => convert(c, marks));
  if (/^h[1-6]$/.test(tag)) {
    if (cls.includes('cu-pdf-export__header')) return [];
    return [block('heading', nested.filter(c => ['text','hardBreak'].includes(c.type)), { level:Number(tag[1]) })];
  }
  if (tag === 'p') return pack(nested).length ? pack(nested) : [block('paragraph', [])];
  if (tag === 'li') return [block('listItem', pack(nested))];
  if (tag === 'ul' || tag === 'ol') return [block(tag === 'ul' ? 'bulletList' : 'orderedList', nested.filter(c => c.type === 'listItem'))];
  if (tag === 'table') return [block('table', nested.filter(c => c.type === 'tableRow'))];
  if (tag === 'tr') return [block('tableRow', nested.filter(c => ['tableCell','tableHeader'].includes(c.type)))];
  if (tag === 'td' || tag === 'th') return [block(tag === 'th' ? 'tableHeader' : 'tableCell', pack(nested), { colspan:Number(n.getAttribute('colspan') || 1), rowspan:Number(n.getAttribute('rowspan') || 1) })];
  if (cls.includes('ql-advanced-banner')) return [block('banner', pack(nested), { tone:'info' })];
  if (tag === 'blockquote') return [block('blockquote', pack(nested))];
  return nested;
}
const tree = block('doc', pack(children(root).flatMap(n => convert(n))));
const content = parsePageContent({ body:encodeRich(tree) }, 'free');
const textOf = n => (n.text || '') + (n.content || []).map(textOf).join('');
const normalize = s => s.replace(/\s/g, '');
const expected = normalize(root.textContent.replace('Bannayuu Next Doc Overview', ''));
if (normalize(textOf(tree)) !== expected) {
  const actual = normalize(textOf(tree)); let at = 0; while (actual[at] === expected[at] && at < actual.length) at++;
  console.log({ at, expected:expected.slice(at-80,at+180), actual:actual.slice(at-80,at+180), expectedLength:expected.length, actualLength:actual.length });
  throw new Error('Text completeness check failed');
}
const counts = {};
function count(n) { counts[n.type] = (counts[n.type] || 0) + 1; n.content?.forEach(count); }
count(tree);
console.log(JSON.stringify({ source, characters:content.body.length, textComplete:true, counts }));
if (process.argv.includes('--apply')) {
  const db = new pg.Client({ connectionString:process.env.DATABASE_URL }); await db.connect();
  try {
    await db.query('BEGIN');
    const { rows:[doc] } = await db.query(`SELECT d.* FROM pmt_docs d JOIN pmt_projects p ON p.project_id=d.doc_project_id WHERE d.doc_id=$1 AND d.doc_title=$2 AND p.project_slug='bannayuu-next' AND d.doc_archived_at IS NULL FOR UPDATE OF d`, [docId,'Bannayuu Next Doc Overview']);
    if (!doc) throw new Error('Target document mismatch');
    const { rows:[membership] } = await db.query('SELECT member_role FROM pmt_project_members WHERE member_project_id=$1 AND member_user_id=$2', [doc.doc_project_id, doc.doc_created_by]);
    if (membership?.member_role !== 'admin') throw new Error('Document creator is not a project admin');
    const existing = await db.query('SELECT 1 FROM pmt_doc_pages WHERE doc_page_doc_id=$1', [docId]);
    if (existing.rowCount) throw new Error('Target already has pages; refusing duplicate import');
    const id = randomUUID();
    await db.query(`INSERT INTO pmt_doc_pages (doc_page_id,doc_page_doc_id,doc_page_depth,doc_page_title,doc_page_slug,doc_page_template,doc_page_content,doc_page_updated_by) VALUES ($1,$2,1,$3,$4,'free',$5,$6)`, [id, docId, 'Bannayuu Next Doc Overview', `page-${id}`, JSON.stringify(content), doc.doc_created_by]);
    const {rows:[saved]} = await db.query('SELECT doc_page_content FROM pmt_doc_pages WHERE doc_page_id=$1', [id]);
    if (saved.doc_page_content.body !== content.body) throw new Error('Saved content mismatch');
    await db.query('UPDATE pmt_docs SET doc_updated_at=now() WHERE doc_id=$1', [docId]);
    await db.query('COMMIT');
    console.log(JSON.stringify({ url:`http://localhost:3000/p/bannayuu-next/docs/page-${id}`, verified:true }));
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
}
