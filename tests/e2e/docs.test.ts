import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { docAssetStorageKey } from '../../src/lib/doc-asset-path.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;
before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);
});
after(async () => { await fx?.cleanup(); });

async function assetFilePath(id: string) {
  const { rows } = await fx.client.query('SELECT asset_filename, asset_created_at FROM pmt_doc_assets WHERE asset_id = $1', [id]);
  const key = docAssetStorageKey({ id, filename: rows[0].asset_filename, createdAt: rows[0].asset_created_at });
  assert.match(key, /^\d{2}\/\d{2}\//);
  return path.join(process.env.DOC_ASSET_DIR || 'data/doc-assets', key);
}

async function call(jar: Jar, method: string, body?: unknown, projectId = fx.projectId) {
  return fetch(`${BASE_URL}/api/projects/${projectId}/docs`, {
    method, headers: { cookie: jar.header, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('admin creates a document, viewer sees the persisted Thai title and version', async () => {
  const response = await call(admin, 'POST', { title: ' ขอบเขตโครงการ ', version: 'V.1' });
  assert.equal(response.status, 200);
  const created = await response.json();
  const list = await call(viewer, 'GET');
  assert.equal(list.status, 200);
  assert.ok((await list.json()).some((d: { id: string; title: string; version: string }) =>
    d.id === created.id && d.title === 'ขอบเขตโครงการ' && d.version === 'V.1'));
});

test('viewer and member cannot create document structure', async () => {
  assert.equal((await call(viewer, 'POST', { title: 'Forbidden' })).status, 403);
  await fx.client.query("UPDATE pmt_project_members SET member_role = 'member' WHERE member_project_id = $1 AND member_user_id = $2", [fx.projectId, fx.viewer.id]);
  try {
    assert.equal((await call(viewer, 'POST', { title: 'Forbidden' })).status, 403);
    assert.equal((await call(viewer, 'GET')).status, 200);
  } finally {
    await fx.client.query("UPDATE pmt_project_members SET member_role = 'viewer' WHERE member_project_id = $1 AND member_user_id = $2", [fx.projectId, fx.viewer.id]);
  }
});

test('non-members cannot discover docs or create into another project', async () => {
  const other = randomUUID();
  await fx.client.query('INSERT INTO pmt_projects(project_id, project_name, project_slug) VALUES ($1, $2, $3)', [other, 'Docs isolation test', `docs-test-${other}`]);
  try {
    assert.equal((await call(admin, 'GET', undefined, other)).status, 404);
    assert.equal((await call(admin, 'POST', { title: 'No access' }, other)).status, 404);
  } finally { await fx.client.query('DELETE FROM pmt_projects WHERE project_id = $1', [other]); }
});

test('invalid document input gives actionable validation', async () => {
  assert.equal((await call(admin, 'POST', { title: ' ' })).status, 422);
  assert.equal((await call(admin, 'POST', { title: 'Test', version: 123 })).status, 422);
});

test('legacy flat assets remain readable through their existing authenticated URLs', async () => {
  const id = randomUUID();
  const root = process.env.DOC_ASSET_DIR || 'data/doc-assets';
  const legacyPath = path.join(root, id);
  const content = 'Existing attachment';
  await mkdir(root, { recursive: true });
  await writeFile(legacyPath, content, { flag: 'wx' });
  try {
    await fx.client.query('INSERT INTO pmt_doc_assets (asset_id, asset_project_id, asset_filename, asset_mime, asset_bytes) VALUES ($1, $2, $3, $4, $5)', [id, fx.projectId, 'legacy.txt', 'application/octet-stream', Buffer.byteLength(content)]);
    const response = await fetch(`${BASE_URL}/api/doc-assets/${id}`, { headers: { cookie: admin.header } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), content);
  } finally {
    await fx.client.query('DELETE FROM pmt_doc_assets WHERE asset_id = $1', [id]);
    await unlink(legacyPath);
  }
});

test('attachments accept exactly 50 MB and reject one byte over the limit', async () => {
  const bytes = new Uint8Array(50 * 1024 * 1024);
  bytes[0] = 23; bytes[bytes.length - 1] = 42;
  const form = new FormData();
  form.set('kind', 'attachment');
  form.set('file', new File([bytes], 'boundary.bin'));
  const response = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: admin.header }, body: form });
  assert.equal(response.status, 200, await response.clone().text());
  const asset = await response.json();
  const id = asset.url.split('/').at(-1);
  try {
    assert.equal(asset.bytes, bytes.length);
    assert.deepEqual(new Uint8Array(await readFile(await assetFilePath(id))), bytes);
    const download = await fetch(`${BASE_URL}${asset.url}`, { headers: { cookie: admin.header } });
    assert.equal(download.status, 200);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
    form.set('file', new File([bytes, new Uint8Array(1)], 'too-large.bin'));
    const rejected = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: admin.header }, body: form });
    assert.equal(rejected.status, 422);
    assert.match((await rejected.json()).message, /50 MB/);
  } finally {
    await unlink(await assetFilePath(id));
    await fx.client.query('DELETE FROM pmt_doc_assets WHERE asset_id = $1', [id]);
  }
});

test('file attachments preserve bytes, force download, and enforce project access', async () => {
  const upload = (jar: Jar, file: File) => {
    const form = new FormData(); form.set('file', file); form.set('kind', 'attachment');
    return fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: jar.header }, body: form });
  };
  const source = '<html><script>alert(1)</script></html>';
  const file = new File([source], 'เอกสารทดสอบ.html', { type: 'text/html' });
  assert.equal((await upload(viewer, file)).status, 403);
  assert.equal((await upload(admin, new File([], 'empty.txt'))).status, 422);
  assert.equal((await upload(admin, new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'large.zip'))).status, 422);
  // Members can attach files as well as edit content.
  await fx.client.query("UPDATE pmt_project_members SET member_role = 'member' WHERE member_project_id=$1 AND member_user_id=$2", [fx.projectId, fx.viewer.id]);
  let assetId: string | undefined;
  try {
    const response = await upload(viewer, file);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.filename, file.name);
    assert.equal(body.bytes, file.size);
    assetId = body.url.split('/').at(-1);
    assert.match(assetId!, /^[a-f0-9-]{36}$/);
    const downloaded = await fetch(`${BASE_URL}${body.url}`, { headers: { cookie: admin.header } });
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('content-type'), 'application/octet-stream');
    assert.match(downloaded.headers.get('content-disposition')!, /^attachment;/);
    assert.ok(downloaded.headers.get('content-disposition')!.includes(encodeURIComponent(file.name)));
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await downloaded.text(), source);
    assert.equal((await fetch(`${BASE_URL}${body.url}`)).status, 401);
    await fx.client.query('UPDATE pmt_projects SET project_archived_at=now() WHERE project_id=$1', [fx.projectId]);
    try { assert.equal((await fetch(`${BASE_URL}${body.url}`, { headers: { cookie: admin.header } })).status, 404); }
    finally { await fx.client.query('UPDATE pmt_projects SET project_archived_at=null WHERE project_id=$1', [fx.projectId]); }
    await fx.client.query('DELETE FROM pmt_project_members WHERE member_project_id=$1 AND member_user_id=$2', [fx.projectId, fx.viewer.id]);
    try { assert.equal((await fetch(`${BASE_URL}${body.url}`, { headers: { cookie: viewer.header } })).status, 404); }
    finally { await fx.client.query("INSERT INTO pmt_project_members(member_project_id, member_user_id, member_role) VALUES ($1,$2,'viewer')", [fx.projectId, fx.viewer.id]); }
  } finally {
    await fx.client.query("UPDATE pmt_project_members SET member_role='viewer' WHERE member_project_id=$1 AND member_user_id=$2", [fx.projectId, fx.viewer.id]);
    if (assetId && /^[a-f0-9-]{36}$/.test(assetId)) await unlink(await assetFilePath(assetId));
  }
});

test('Docs page renders the saved register and only offers creation to admins', async () => {
  const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
  for (const [jar, isAdmin] of [[admin, true], [viewer, false]] as const) {
    const page = await fetch(`${BASE_URL}/p/${rows[0].project_slug}/docs`, { headers: { cookie: jar.header } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Search title or version/);
    assert.match(html, /ขอบเขตโครงการ/);
    assert.equal(html.includes('+ New doc'), isAdmin);
  }
});

test('archived projects refuse reads and creates', async () => {
  await fx.client.query('UPDATE pmt_projects SET project_archived_at = now() WHERE project_id = $1', [fx.projectId]);
  try {
    assert.equal((await call(admin, 'GET')).status, 404);
    assert.equal((await call(admin, 'POST', { title: 'No' })).status, 404);
  } finally { await fx.client.query('UPDATE pmt_projects SET project_archived_at = NULL WHERE project_id = $1', [fx.projectId]); }
});

test('editor persists Markdown, refuses stale saves, and enforces page roles and depth', async () => {
  const doc = await (await call(admin, 'POST', { title: 'Editor test' })).json();
  const request = (jar: Jar, path: string, method = 'GET', body?: unknown) => fetch(`${BASE_URL}${path}`, {
    method, headers: { cookie: jar.header, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const pageResponse = await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { title: 'รายละเอียด', template: 'free' });
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.json();
  const saved = await request(admin, `/api/doc-pages/${page.id}`, 'PATCH', { content: { body: '# ภาษาไทย\n\n**scope**\n\n- [x] Ready' }, updatedAt: page.updatedAt });
  assert.equal(saved.status, 200);
  const token = (await saved.json()).updatedAt;
  assert.notEqual(token, page.updatedAt);
  const stale = await request(admin, `/api/doc-pages/${page.id}`, 'PATCH', { content: { body: 'overwrite' }, updatedAt: page.updatedAt });
  assert.equal(stale.status, 409);
  assert.ok((await stale.json()).updatedBy);
  assert.equal((await request(viewer, `/api/doc-pages/${page.id}`, 'PATCH', { content: { body: 'no' }, updatedAt: token })).status, 403);
  assert.equal((await request(viewer, `/api/docs/${doc.id}/pages`, 'POST', { title: 'No' })).status, 403);
  await fx.client.query("UPDATE pmt_project_members SET member_role = 'member' WHERE member_project_id = $1 AND member_user_id = $2", [fx.projectId, fx.viewer.id]);
  try {
    assert.equal((await request(viewer, `/api/doc-pages/${page.id}`, 'PATCH', { content: { body: 'Member update' }, updatedAt: token })).status, 200);
    const history = await (await request(viewer, `/api/doc-pages/${page.id}/history`)).json();
    assert.equal(history.length, 2);
    assert.equal(history[0].content.body, 'Member update');
  } finally {
    await fx.client.query("UPDATE pmt_project_members SET member_role = 'viewer' WHERE member_project_id = $1 AND member_user_id = $2", [fx.projectId, fx.viewer.id]);
  }
  const child = await (await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { title: 'Child', parentId: page.id })).json();
  const grandchild = await (await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { title: 'Grandchild', parentId: child.id })).json();
  assert.equal(grandchild.depth, 3);
  assert.equal((await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { title: 'Too deep', parentId: grandchild.id })).status, 422);
  const data = await (await request(viewer, `/api/docs/${doc.id}/pages`)).json();
  assert.equal(data.pages.find((p: { id: string }) => p.id === page.id).content.body, 'Member update');
  const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
  const html = await (await request(viewer, `/p/${rows[0].project_slug}/docs/${page.slug}`)).text();
  assert.match(html, /Member update/);
  assert.ok(!html.includes('Edit page</button>'));
  const svg = new FormData(); svg.set('file', new File(['<svg><g></svg>'], 'invalid.svg', { type: 'image/svg+xml' }));
  assert.equal((await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: admin.header }, body: svg })).status, 422);
  const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.box{fill:blue;stroke-width:2}</style><rect class="box" width="100" height="100"/></svg>';
  const svgForm = new FormData(); svgForm.set('file', new File([safeSvg], 'diagram.svg', { type:'image/svg+xml' }));
  const svgUpload = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method:'POST', headers:{cookie:admin.header}, body:svgForm });
  assert.equal(svgUpload.status, 200);
  const svgAsset = await svgUpload.json();
  const svgRead = await request(viewer, svgAsset.url);
  assert.equal(svgRead.headers.get('content-type'), 'image/svg+xml');
  assert.match(svgRead.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal(await svgRead.text(), safeSvg);
  const maliciousSvg = new FormData(); maliciousSvg.set('file', new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'script.svg', {type:'image/svg+xml'}));
  const scriptUpload = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, {method:'POST',headers:{cookie:admin.header},body:maliciousSvg});
  assert.equal(scriptUpload.status, 200);
  const scriptRead = await request(viewer, (await scriptUpload.json()).url);
  assert.match(scriptRead.headers.get('content-security-policy') ?? '', /script-src 'none'/);
  assert.match(scriptRead.headers.get('content-security-policy') ?? '', /sandbox;/);
  const large = new FormData(); large.set('file', new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  assert.equal((await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: admin.header }, body: large })).status, 422);
  const linked = await (await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { template: 'module', nodeId: fx.nodes.module })).json();
  assert.deepEqual(Object.keys(linked.content).sort(), ['description','wantFeature','decisions','currentScope','nextPhase'].sort());
  assert.equal((await request(admin, `/api/doc-pages/${linked.id}`, 'PATCH', { updatedAt: linked.updatedAt,
    content: { ...linked.content, description: 'Camera scope', decisions: 'Firmware 4' } })).status, 200);
  await fx.client.query("UPDATE pmt_nodes SET node_name = 'Renamed module', node_archived_at = now() WHERE node_id = $1", [fx.nodes.module]);
  const linkedData = (await (await request(viewer, `/api/docs/${doc.id}/pages`)).json()).pages.find((p: { id: string }) => p.id === linked.id);
  assert.equal(linkedData.title, 'Renamed module');
  assert.equal(linkedData.nodeArchived, true);
  assert.equal(linkedData.content.decisions, 'Firmware 4');
});

test('inline page title saves atomically with content and preserves slug and permissions', async () => {
  const doc = await (await call(admin, 'POST', { title: 'Inline title test' })).json();
  const request = (jar: Jar, route: string, method: string, body?: unknown) => fetch(`${BASE_URL}${route}`, {
    method, headers: { cookie: jar.header, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const page = await (await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { title: 'Untitled' })).json();
  const endpoint = `/api/doc-pages/${page.id}`;
  const draft = { title: 'ชื่อหน้าใหม่', content: { body: 'Keep the content' }, updatedAt: page.updatedAt };
  assert.equal((await request(viewer, endpoint, 'PATCH', draft)).status, 403);
  assert.equal((await request(admin, endpoint, 'PATCH', { ...draft, title: ' ' })).status, 422);
  assert.equal((await request(admin, endpoint, 'PATCH', { ...draft, title: 'x'.repeat(201) })).status, 422);
  const response = await request(admin, endpoint, 'PATCH', draft);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).title, draft.title);
  assert.equal((await request(admin, endpoint, 'PATCH', { ...draft, title: 'Stale overwrite' })).status, 409);
  const data = await (await request(admin, `/api/docs/${doc.id}/pages`, 'GET')).json();
  const stored = data.pages.find((p: { id: string }) => p.id === page.id);
  assert.equal(stored.title, draft.title);
  assert.equal(stored.slug, page.slug);
  assert.equal(stored.content.body, draft.content.body);
  const linkedResponse = await request(admin, `/api/docs/${doc.id}/pages`, 'POST', { template: 'module', nodeId: fx.nodes.task });
  assert.equal(linkedResponse.status, 200);
  const linked = await linkedResponse.json();
  assert.equal((await request(admin, `/api/doc-pages/${linked.id}`, 'PATCH', { title: 'Do not detach', content: linked.content, updatedAt: linked.updatedAt })).status, 422);
});

test('doc tools persist comments, settings, protection, templates and copies with role checks',async()=>{
  const doc=await(await call(admin,'POST',{title:'Tools test'})).json();
  const request=(jar:Jar,url:string,body?:unknown)=>fetch(`${BASE_URL}${url}`,{method:body?'POST':'GET',headers:{cookie:jar.header,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  let page=await(await request(admin,`/api/docs/${doc.id}/pages`,{title:'Tools page',content:{body:'Original content'}})).json();
  const endpoint=`/api/doc-pages/${page.id}/tools`;
  const act=(jar:Jar,body:Record<string,unknown>)=>request(jar,endpoint,{...body,updatedAt:page.updatedAt});
  assert.equal((await act(viewer,{action:'comment',body:'Forbidden'})).status,403);
  assert.equal((await act(admin,{action:'comment',body:'Test comment',quote:'Original'})).status,200);
  let state=await(await request(viewer,endpoint)).json();assert.equal(state.comments[0].quote,'Original');
  assert.equal((await act(admin,{action:'resolve',commentId:state.comments[0].id,resolved:true})).status,200);
  state=await(await request(viewer,endpoint)).json();assert.equal(state.comments[0].resolved,true);
  assert.equal((await act(admin,{action:'settings',settings:{cover:'javascript:alert(1)'}})).status,422);
  const settings=await act(admin,{action:'settings',settings:{font:'serif',subtitle:'ภาษาไทย',showStats:true}});assert.equal(settings.status,200);page.updatedAt=(await settings.json()).updatedAt;
  const protect=await act(admin,{action:'protect',protected:true});assert.equal(protect.status,200);page.updatedAt=(await protect.json()).updatedAt;
  const save=await fetch(`${BASE_URL}/api/doc-pages/${page.id}`,{method:'PATCH',headers:{cookie:admin.header,'content-type':'application/json'},body:JSON.stringify({updatedAt:page.updatedAt,content:{body:'No'}})});assert.equal(save.status,403);
  assert.equal((await act(admin,{action:'template',title:'Reusable'})).status,200);
  state=await(await request(viewer,endpoint)).json();assert.equal(state.templates[0].title,'Reusable');
  const templated=await act(admin,{action:'applyTemplate',templateId:state.templates[0].id});assert.equal(templated.status,403); // protected page requires explicit unprotect first
  const unprotect=await act(admin,{action:'protect',protected:false});page.updatedAt=(await unprotect.json()).updatedAt;
  const copy=await act(admin,{action:'duplicate'});assert.equal(copy.status,200);assert.ok((await copy.json()).slug);
  const fromTemplate=await act(admin,{action:'applyTemplate',templateId:state.templates[0].id});assert.equal(fromTemplate.status,200);
  const pages=(await(await request(viewer,`/api/docs/${doc.id}/pages`)).json()).pages;
  assert.equal(pages.length,3);assert.equal(pages.find((p:{id:string})=>p.id===page.id).settings.subtitle,'ภาษาไทย');
  assert.ok(pages.every((p:{content:{body:string}})=>p.content.body==='Original content'));
  await fx.client.query("UPDATE pmt_project_members SET member_role='member' WHERE member_project_id=$1 AND member_user_id=$2",[fx.projectId,fx.viewer.id]);
  try{assert.equal((await act(viewer,{action:'duplicate'})).status,403);assert.equal((await act(viewer,{action:'applyTemplate',templateId:state.templates[0].id})).status,403);}finally{await fx.client.query("UPDATE pmt_project_members SET member_role='viewer' WHERE member_project_id=$1 AND member_user_id=$2",[fx.projectId,fx.viewer.id]);}
});

test('move validates cycles and depth, final-page archive can be restored from overview',async()=>{
  const doc=await(await call(admin,'POST',{title:'Move and archive test'})).json();
  const request=(route:string,method='GET',body?:unknown,jar=admin)=>fetch(`${BASE_URL}${route}`,{method,headers:{cookie:jar.header,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const page=await(await request(`/api/docs/${doc.id}/pages`,'POST',{title:'Last active page'})).json();
  const endpoint=`/api/doc-pages/${page.id}/tools`;
  assert.equal((await request(endpoint,'POST',{action:'move',parentId:page.id,updatedAt:page.updatedAt})).status,422);
  assert.equal((await request(endpoint,'POST',{action:'archive',updatedAt:page.updatedAt})).status,200);
  const data=await(await request(`/api/docs/${doc.id}/pages`)).json();assert.equal(data.pages.length,0);assert.equal(data.archivedPages[0].id,page.id);
  assert.equal((await request(`/api/docs/${doc.id}/pages`,'PATCH',{pageId:page.id},viewer)).status,403);
  assert.equal((await request(`/api/docs/${doc.id}/pages`,'PATCH',{pageId:page.id})).status,200);
  const restored=await(await request(`/api/docs/${doc.id}/pages`)).json();assert.equal(restored.pages[0].id,page.id);assert.equal(restored.archivedPages.length,0);
  const child=await(await request(`/api/docs/${doc.id}/pages`,'POST',{title:'Archived child',parentId:page.id})).json();
  assert.equal((await request(`/api/doc-pages/${child.id}/tools`,'POST',{action:'archive',updatedAt:child.updatedAt})).status,200);
  const parent=await(await request(`/api/docs/${doc.id}/pages`,'POST',{title:'New parent'})).json();
  assert.equal((await request(endpoint,'POST',{action:'move',parentId:parent.id,updatedAt:restored.pages[0].updatedAt})).status,200);
  assert.equal((await request(`/api/docs/${doc.id}/pages`,'PATCH',{pageId:child.id})).status,200);
  const moved=(await(await request(`/api/docs/${doc.id}/pages`)).json()).pages;assert.equal(moved.find((p:{id:string})=>p.id===child.id).depth,3);
});

test('rich content persists safely and replies cannot cross page/project boundaries',async()=>{
  const doc=await(await call(admin,'POST',{title:'Rich API test'})).json();
  const request=(route:string,method='GET',body?:unknown)=>fetch(`${BASE_URL}${route}`,{method,headers:{cookie:admin.header,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const rich='fieldbook-rich-v1:'+JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'ไทย',marks:[{type:'underline'},{type:'textColor',attrs:{color:'#235ab5'}}]}]}]});
  const page=await(await request(`/api/docs/${doc.id}/pages`,'POST',{title:'Rich',content:{body:rich}})).json();
  const endpoint=`/api/doc-pages/${page.id}/tools`;
  assert.equal((await request(endpoint,'POST',{action:'comment',body:'Assigned',assigneeId:fx.viewer.id})).status,200);
  let data=await(await request(endpoint)).json();const root=data.comments[0];assert.equal(root.assigneeId,fx.viewer.id);
  assert.equal((await request(endpoint,'POST',{action:'comment',body:'Reply',parentId:root.id})).status,200);
  data=await(await request(endpoint)).json();assert.equal(data.comments[0].parentId,root.id);
  const other=await(await request(`/api/docs/${doc.id}/pages`,'POST',{title:'Other'})).json();
  assert.equal((await request(`/api/doc-pages/${other.id}/tools`,'POST',{action:'comment',body:'Wrong page',parentId:root.id})).status,422);
  const unsafe='fieldbook-rich-v1:'+JSON.stringify({type:'doc',content:[{type:'image',attrs:{src:'javascript:alert(1)'}}]});
  assert.equal((await request(`/api/doc-pages/${page.id}`,'PATCH',{content:{body:unsafe},updatedAt:page.updatedAt})).status,422);
  assert.equal((await(await request(`/api/docs/${doc.id}/pages`)).json()).pages.find((p:{id:string})=>p.id===page.id).content.body,rich);
});
