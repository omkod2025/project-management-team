import 'server-only';
import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { docs, docPages, docRevisions, nodes, projects, users, projectMembers } from '@/db/schema';
import { authorize, requireProjectRole } from '@/lib/permissions';
import { domainError } from '@/lib/errors';
import { parseNewDoc, pageSections, parsePageContent, nextPageDepth, extendRevision, type DocPage, type DocSummary, type PageTemplate } from '@/lib/doc-rules';

async function visibleProject(userId: string, projectId: string) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId)) {
    throw domainError('E_NOT_FOUND', 'No such project.');
  }
  await requireProjectRole(userId, projectId, 'read');
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.archivedAt))).limit(1);
  if (!project) throw domainError('E_NOT_FOUND', 'No such project.');
}

export async function listDocs(userId: string, projectId: string): Promise<DocSummary[]> {
  await visibleProject(userId, projectId);
  const rows = await db.select({
    id: docs.id, title: docs.title, version: docs.version,
    createdByName: users.fullName, updatedAt: docs.updatedAt,
  }).from(docs).leftJoin(users, eq(docs.createdBy, users.id))
    .where(and(eq(docs.projectId, projectId), isNull(docs.archivedAt)))
    .orderBy(desc(docs.updatedAt), docs.id);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function createDoc(userId: string, projectId: string, input: unknown): Promise<DocSummary> {
  await visibleProject(userId, projectId);
  await authorize(userId, projectId, 'doc.create');
  const data = parseNewDoc(input);
  const [doc] = await db.insert(docs).values({ ...data, projectId, createdBy: userId }).returning();
  const [creator] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
  return { id: doc!.id, title: doc!.title, version: doc!.version,
    createdByName: creator?.name ?? null, updatedAt: doc!.updatedAt.toISOString() };
}

export async function loadProjectDocs(userId: string, slug: string) {
  const [project] = await db.select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects).where(and(eq(projects.slug, slug), isNull(projects.archivedAt))).limit(1);
  if (!project) throw domainError('E_NOT_FOUND', 'No such project.');
  const role = await requireProjectRole(userId, project.id);
  return { project, role, docs: await listDocs(userId, project.id) };
}

function validId(id: string) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw domainError('E_NOT_FOUND', 'No such document.');
}

export async function requireDoc(userId: string, id: string) {
  validId(id);
  const [doc] = await db.select().from(docs).where(and(eq(docs.id, id), isNull(docs.archivedAt))).limit(1);
  if (!doc) throw domainError('E_NOT_FOUND', 'No such document.');
  await visibleProject(userId, doc.projectId);
  return doc;
}

export async function loadDoc(userId: string, docId: string) {
  const doc = await requireDoc(userId, docId);
  const archivedPages = await db.select({id:docPages.id,title:docPages.title}).from(docPages).where(and(eq(docPages.docId,docId),isNotNull(docPages.archivedAt)));
  const pages = await db.select().from(docPages).where(and(eq(docPages.docId, docId), isNull(docPages.archivedAt)))
    .orderBy(docPages.sortOrder, docPages.id);
  const projectNodes = await db.select().from(nodes).where(eq(nodes.projectId, doc.projectId));
  const byId = new Map(projectNodes.map((n) => [n.id, n]));
  const members=await db.select({id:users.id,name:users.fullName}).from(projectMembers).innerJoin(users,eq(users.id,projectMembers.userId)).where(eq(projectMembers.projectId,doc.projectId));
  const modules = projectNodes.filter((n) => n.depth === 2).sort((a, b) => a.sortOrder - b.sortOrder);
  const data: DocPage[] = pages.map((p) => {
    const node = p.nodeId ? byId.get(p.nodeId) : undefined;
    let module = node;
    while (module && module.depth > 2) module = module.parentId ? byId.get(module.parentId) : undefined;
    const idx = module ? modules.findIndex((n) => n.id === module.id) : -1;
    return { ...p, title: node?.name ?? p.title, updatedAt: p.updatedAt.toISOString(), ownerNames:members.filter(m=>String(p.settings.owners ?? '').split(',').includes(m.id)).map(m=>m.name),
      nodeArchived: Boolean(node?.archivedAt), hue: idx >= 0 ? idx % 6 + 1 : null };
  });
  return { doc: { id: doc.id, title: doc.title, version: doc.version, projectId: doc.projectId }, pages: data, archivedPages,
    bindableNodes: projectNodes.filter((n) => n.depth > 1 && !n.archivedAt).map((n) => ({ id: n.id, name: n.name })) };
}

export async function restoreDocPage(userId:string,docId:string,input:unknown){
  const doc=await requireDoc(userId,docId);await authorize(userId,doc.projectId,'doc.create');
  const pageId=input&&typeof input==='object'?(input as {pageId?:unknown}).pageId:undefined;
  if(typeof pageId!=='string')throw domainError('E_INVALID_DOC','Choose an archived page.');validId(pageId);
  return db.transaction(async tx=>{
    await tx.select().from(docs).where(eq(docs.id,docId)).for('update');
    const [page]=await tx.select().from(docPages).where(and(eq(docPages.id,pageId),eq(docPages.docId,docId),isNotNull(docPages.archivedAt)));
    if(!page)throw domainError('E_NOT_FOUND','No such archived page.');
    if(page.parentId){const [parent]=await tx.select().from(docPages).where(and(eq(docPages.id,page.parentId),isNull(docPages.archivedAt)));if(!parent)throw domainError('E_INVALID_DOC','Restore the parent first.');}
    await tx.update(docPages).set({archivedAt:null,updatedAt:new Date(Math.max(Date.now(),page.updatedAt.getTime()+1)),updatedBy:userId}).where(eq(docPages.id,pageId));
    return {slug:page.slug};
  });
}

export async function createDocPage(userId: string, docId: string, input: unknown) {
  const doc = await requireDoc(userId, docId);
  await authorize(userId, doc.projectId, 'doc.create');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw domainError('E_INVALID_DOC', 'Enter a page title.');
  const body = input as Record<string, unknown>;
  const template = body.template ?? 'free';
  if (template !== 'free' && template !== 'module') throw domainError('E_INVALID_DOC', 'Choose Free or Module.');
  const nodeId = body.nodeId || null;
  let title = body.title;
  if (nodeId) {
    if (template !== 'module' || typeof nodeId !== 'string') throw domainError('E_INVALID_DOC', 'Only Module pages can link to a task.');
    validId(nodeId);
    const [node] = await db.select().from(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.projectId, doc.projectId), isNull(nodes.archivedAt)));
    if (!node || node.depth === 1) throw domainError('E_INVALID_DOC', 'Choose a module or task in this project.');
    title = node.name;
  }
  const parsed = parseNewDoc({ title });
  const parentId = body.parentId || null;
  if (parentId !== null) { if (typeof parentId !== 'string') throw domainError('E_INVALID_DOC', 'Invalid parent page.'); validId(parentId); }
  return db.transaction(async (tx) => {
    // Serialize structural writes in this document before choosing the new position.
    await tx.select().from(docs).where(eq(docs.id, docId)).for('update');
    let parentDepth: number | null = null;
    if (parentId) {
      const [parent] = await tx.select().from(docPages).where(and(eq(docPages.id, parentId), eq(docPages.docId, docId), isNull(docPages.archivedAt)));
      if (!parent) throw domainError('E_INVALID_DOC', 'Choose a parent in this document.');
      parentDepth = parent.depth;
    }
    const content = body.content === undefined ? Object.fromEntries(pageSections(template as PageTemplate).map(([key]) => [key, ''])) : parsePageContent(body.content, template as PageTemplate);
    const id = crypto.randomUUID();
    const [page] = await tx.insert(docPages).values({ id, docId, parentId: parentId as string | null,
      depth: nextPageDepth(parentDepth), title: parsed.title, slug: `page-${id}`, template,
      nodeId: nodeId as string | null, content, sortOrder: Date.now(), updatedBy: userId }).returning();
    await tx.update(docs).set({ updatedAt: new Date() }).where(eq(docs.id, docId));
    return { ...page!, updatedAt: page!.updatedAt.toISOString() };
  });
}

export async function requirePage(userId: string, pageId: string) {
  validId(pageId);
  const [page] = await db.select().from(docPages).where(and(eq(docPages.id, pageId), isNull(docPages.archivedAt)));
  if (!page) throw domainError('E_NOT_FOUND', 'No such page.');
  const doc = await requireDoc(userId, page.docId);
  return { page, doc };
}

export async function saveDocPage(userId: string, pageId: string, input: unknown) {
  const { page, doc } = await requirePage(userId, pageId);
  await authorize(userId, doc.projectId, 'doc.edit');
  if (!input || typeof input !== 'object') throw domainError('E_INVALID_DOC', 'Invalid save.');
  const body = input as Record<string, unknown>;
  const content = parsePageContent(body.content, page.template);
  const title = body.title === undefined ? undefined : parseNewDoc({ title: body.title }).title;
  if (title !== undefined && page.nodeId) throw domainError('E_INVALID_DOC', 'This page uses its linked module or task name. Rename it in the project list.');
  if (typeof body.updatedAt !== 'string') throw domainError('E_INVALID_DOC', 'Reload this page before editing.');
  return db.transaction(async (tx) => {
    await tx.select().from(docs).where(eq(docs.id, doc.id)).for('update');
    const [current] = await tx.select().from(docPages).where(eq(docPages.id, pageId)).for('update');
    if (!current || current.archivedAt) throw domainError('E_NOT_FOUND', 'No such page.');
    if (current.protected) throw domainError('E_FORBIDDEN', 'This page is protected. A project admin must unprotect it before editing.');
    if (current.updatedAt.toISOString() !== body.updatedAt) {
      const [editor] = current.updatedBy ? await tx.select().from(users).where(eq(users.id, current.updatedBy)) : [];
      throw domainError('E_DOC_CONFLICT', `${editor?.fullName ?? 'Another editor'} changed this page. Copy your draft before reloading.`,
        { updatedAt: current.updatedAt.toISOString(), updatedBy: editor?.fullName ?? 'Another editor' });
    }
    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const [last] = await tx.select().from(docRevisions).where(eq(docRevisions.pageId, pageId)).orderBy(desc(docRevisions.updatedAt)).limit(1);
    if (last && body.forceRevision !== true && extendRevision(last.editorId, userId, last.updatedAt.getTime(), now.getTime())) {
      await tx.update(docRevisions).set({ content, updatedAt: now }).where(eq(docRevisions.id, last.id));
    } else {
      await tx.insert(docRevisions).values({ pageId, editorId: userId, content, updatedAt: now });
    }
    await tx.update(docPages).set({ content, ...(title === undefined ? {} : { title }), updatedBy: userId, updatedAt: now }).where(eq(docPages.id, pageId));
    await tx.update(docs).set({ updatedAt: now }).where(eq(docs.id, doc.id));
    return { updatedAt: now.toISOString(), title: title ?? current.title };
  });
}

export async function pageHistory(userId: string, pageId: string) {
  await requirePage(userId, pageId);
  const rows = await db.select({ id: docRevisions.id, content: docRevisions.content,
    updatedAt: docRevisions.updatedAt, editor: users.fullName }).from(docRevisions)
    .leftJoin(users, eq(docRevisions.editorId, users.id)).where(eq(docRevisions.pageId, pageId))
    .orderBy(desc(docRevisions.updatedAt)).limit(50);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function loadPageBySlug(userId: string, projectSlug: string, pageSlug: string) {
  const context = await loadProjectDocs(userId, projectSlug);
  const [page] = await db.select({ docId: docPages.docId }).from(docPages)
    .innerJoin(docs, eq(docPages.docId, docs.id)).where(and(eq(docPages.slug, pageSlug), eq(docs.projectId, context.project.id), isNull(docPages.archivedAt)));
  if (!page) throw domainError('E_NOT_FOUND', 'No such page.');
  const data = await loadDoc(userId, page.docId);
  return { ...data, project: context.project, role: context.role, page: data.pages.find((p) => p.slug === pageSlug)! };
}
