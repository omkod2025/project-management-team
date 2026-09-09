import "server-only";
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  docAssets,
  docComments,
  docPages,
  docTemplates,
  docs,
  nodes,
  projectMembers,
  users,
} from "@/db/schema";
import { requirePage } from "@/lib/docs";
import { authorize } from "@/lib/permissions";
import { domainError } from "@/lib/errors";
import { parseNewDoc, parsePageContent } from "@/lib/doc-rules";
import { lockAssetReferences, stageRemovedAssets } from '@/lib/doc-asset-cleanup';

export async function getDocTools(userId: string, id: string) {
  const { doc } = await requirePage(userId, id);
  const comments = await db
    .select({
      id: docComments.id,
      body: docComments.body,
      quote: docComments.quote,
      resolved: docComments.resolved,
      createdAt: docComments.createdAt,
      author: users.fullName,
      parentId: docComments.parentId,
      assigneeId: docComments.assigneeId,
    })
    .from(docComments)
    .leftJoin(users, eq(users.id, docComments.authorId))
    .where(eq(docComments.pageId, id))
    .orderBy(desc(docComments.createdAt))
    .limit(500);
  const templates = await db
    .select()
    .from(docTemplates)
    .where(eq(docTemplates.projectId, doc.projectId))
    .orderBy(docTemplates.title);
  const archived = await db
    .select({ id: docPages.id, title: docPages.title })
    .from(docPages)
    .where(and(eq(docPages.docId, doc.id), isNotNull(docPages.archivedAt)));
  const people = await db
    .select({ id: users.id, name: users.fullName })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, doc.projectId),
        eq(users.isActive, true),
      ),
    );
  const tasks = await db
    .select({ id: nodes.id, name: nodes.name })
    .from(nodes)
    .where(and(eq(nodes.projectId, doc.projectId), isNull(nodes.archivedAt)));
  return {
    comments,
    templates,
    archived,
    people,
    tasks,
    currentUserId: userId,
  };
}
export async function mutateDocTools(
  userId: string,
  id: string,
  input: unknown,
) {
  const { page, doc } = await requirePage(userId, id);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw domainError("E_INVALID_DOC", "Invalid page action.");
  const b = input as Record<string, unknown>;
  const action = b.action;
  await authorize(
    userId,
    doc.projectId,
    [
      "duplicate",
      "protect",
      "archive",
      "restore",
      "move",
      "template",
      "applyTemplate",
    ].includes(String(action))
      ? "doc.create"
      : "doc.edit",
  );
  if (action === "comment") {
    if (
      typeof b.body !== "string" ||
      !b.body.trim() ||
      b.body.length > 10000 ||
      (b.quote !== undefined &&
        (typeof b.quote !== "string" || b.quote.length > 2000))
    )
      throw domainError(
        "E_INVALID_DOC",
        "Write a comment of 1–10,000 characters.",
      );
    const assigneeId = b.assigneeId || null,
      parentId = b.parentId || null;
    if (assigneeId) {
      if (typeof assigneeId !== "string" || !/^[a-f\d-]{36}$/i.test(assigneeId))
        throw domainError("E_INVALID_DOC", "Choose a project member.");
      const [member] = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, doc.projectId),
            eq(projectMembers.userId, assigneeId),
          ),
        );
      if (!member)
        throw domainError("E_INVALID_DOC", "Choose a project member.");
    }
    if (parentId) {
      if (typeof parentId !== "string" || !/^[a-f\d-]{36}$/i.test(parentId))
        throw domainError("E_INVALID_DOC", "Invalid reply.");
      const [parent] = await db
        .select()
        .from(docComments)
        .where(and(eq(docComments.id, parentId), eq(docComments.pageId, id)));
      if (!parent)
        throw domainError("E_INVALID_DOC", "Reply to a comment on this page.");
    }
    await db
      .insert(docComments)
      .values({
        pageId: id,
        authorId: userId,
        body: b.body.trim(),
        quote: typeof b.quote === "string" ? b.quote : "",
        assigneeId: assigneeId as string | null,
        parentId: parentId as string | null,
      });
    return { ok: true };
  }
  if (action === "resolve") {
    if (
      typeof b.commentId !== "string" ||
      !/^[a-f\d-]{36}$/i.test(b.commentId) ||
      typeof b.resolved !== "boolean"
    )
      throw domainError("E_INVALID_DOC", "Invalid comment.");
    const rows = await db
      .update(docComments)
      .set({ resolved: b.resolved })
      .where(and(eq(docComments.id, b.commentId), eq(docComments.pageId, id)))
      .returning({ id: docComments.id });
    if (!rows.length) throw domainError("E_NOT_FOUND", "No such comment.");
    return { ok: true };
  }
  const result = await db.transaction(async (tx) => {
    await lockAssetReferences(tx, doc.projectId);
    // Use the same document → page lock order for every structural action.
    await tx.select().from(docs).where(eq(docs.id, doc.id)).for("update");
    const [current] = await tx
      .select()
      .from(docPages)
      .where(eq(docPages.id, id))
      .for("update");
    if (!current || current.archivedAt)
      throw domainError("E_NOT_FOUND", "No such page.");
    if (b.updatedAt !== current.updatedAt.toISOString())
      throw domainError(
        "E_DOC_CONFLICT",
        "This page changed. Reload before retrying.",
      );
    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    await tx.update(docs).set({ updatedAt: now }).where(eq(docs.id, doc.id));
    if (action === "duplicate") {
      const copyId = crypto.randomUUID();
      const [linked] = current.nodeId
        ? await tx
            .select({ name: nodes.name })
            .from(nodes)
            .where(eq(nodes.id, current.nodeId))
        : [];
      const [copy] = await tx
        .insert(docPages)
        .values({
          docId: doc.id,
          parentId: current.parentId,
          depth: current.depth,
          title: `${(linked?.name ?? current.title).slice(0, 190)} (copy)`,
          slug: `page-${copyId}`,
          id: copyId,
          template: current.template,
          content: current.content,
          settings: current.settings,
          sortOrder: Date.now(),
          updatedBy: userId,
        })
        .returning();
      return { slug: copy!.slug };
    }
    if (action === "template") {
      const title = parseNewDoc({ title: b.title }).title;
      await tx
        .insert(docTemplates)
        .values({
          projectId: doc.projectId,
          title,
          kind: current.template,
          content: current.content,
        });
      return { ok: true };
    }
    if (action === "protect") {
      if (typeof b.protected !== "boolean")
        throw domainError("E_INVALID_DOC", "Choose a protection state.");
      await tx
        .update(docPages)
        .set({ protected: b.protected, updatedAt: now, updatedBy: userId })
        .where(eq(docPages.id, id));
      return { updatedAt: now.toISOString() };
    }
    if (action === "restore") {
      if (typeof b.pageId !== "string" || !/^[a-f\d-]{36}$/i.test(b.pageId))
        throw domainError("E_INVALID_DOC", "Choose an archived page.");
      const [target] = await tx
        .select()
        .from(docPages)
        .where(
          and(
            eq(docPages.id, b.pageId),
            eq(docPages.docId, doc.id),
            isNotNull(docPages.archivedAt),
          ),
        );
      if (!target) throw domainError("E_NOT_FOUND", "No such archived page.");
      if (target.parentId) {
        const [parent] = await tx
          .select()
          .from(docPages)
          .where(
            and(eq(docPages.id, target.parentId), isNull(docPages.archivedAt)),
          );
        if (!parent)
          throw domainError("E_INVALID_DOC", "Restore the parent page first.");
      }
      await tx
        .update(docPages)
        .set({ archivedAt: null, updatedAt: now, updatedBy: userId })
        .where(eq(docPages.id, target.id));
      return { slug: target.slug };
    }
    if (current.protected)
      throw domainError(
        "E_FORBIDDEN",
        "Unprotect this page before changing it.",
      );
    if (action === "move") {
      const all = await tx
        .select()
        .from(docPages)
        .where(eq(docPages.docId, doc.id));
      const parentId = b.parentId || null;
      const parent = parentId ? all.find((p) => p.id === parentId && !p.archivedAt) : null;
      if (parentId && !parent)
        throw domainError("E_INVALID_DOC", "Choose a parent in this Doc.");
      const descendants = new Set([id]);
      let added = true;
      while (added) {
        added = false;
        for (const p of all)
          if (
            p.parentId &&
            descendants.has(p.parentId) &&
            !descendants.has(p.id)
          ) {
            descendants.add(p.id);
            added = true;
          }
      }
      if (parentId && descendants.has(String(parentId)))
        throw domainError(
          "E_INVALID_DOC",
          "A page cannot be moved inside itself.",
        );
      const delta = (parent ? parent.depth + 1 : 1) - current.depth;
      if (all.some((p) => descendants.has(p.id) && p.depth + delta > 3))
        throw domainError(
          "E_MAX_DEPTH",
          "This move would exceed three page levels.",
        );
      for (const p of all.filter((p) => descendants.has(p.id)))
        await tx
          .update(docPages)
          .set({
            depth: p.depth + delta,
            ...(p.id === id ? { parentId: parentId as string | null } : {}),
            updatedAt: new Date(
              Math.max(now.getTime(), p.updatedAt.getTime() + 1),
            ),
            updatedBy: userId,
          })
          .where(eq(docPages.id, p.id));
      return { ok: true };
    }
    if (action === "archive") {
      const children = await tx
        .select({ id: docPages.id })
        .from(docPages)
        .where(and(eq(docPages.parentId, id), isNull(docPages.archivedAt)))
        .limit(1);
      if (children.length)
        throw domainError(
          "E_INVALID_DOC",
          "Archive subpages first. Their content will not be removed.",
        );
      await tx
        .update(docPages)
        .set({ archivedAt: now, updatedAt: now, updatedBy: userId })
        .where(eq(docPages.id, id));
      return { archived: true };
    }
    if (action === "settings") {
      if (
        !b.settings ||
        typeof b.settings !== "object" ||
        Array.isArray(b.settings)
      )
        throw domainError("E_INVALID_DOC", "Invalid page settings.");
      const settings = { ...current.settings };
      for (const [k, v] of Object.entries(b.settings)) {
        const choices: Record<string, string[]> = {
          font: ["system", "serif", "mono"],
          size: ["small", "default", "large"],
        };
        if (choices[k]?.includes(String(v))) settings[k] = String(v);
        else if (
          ["wide", "showStats", "showModified", "showTitle"].includes(k) &&
          typeof v === "boolean"
        )
          settings[k] = v;
        else if (
          ["icon", "subtitle"].includes(k) &&
          typeof v === "string" &&
          v.length <= (k === "icon" ? 16 : 300)
        )
          settings[k] = v;
        else if (
          ["relatedPages", "relatedTasks", "owners"].includes(k) &&
          typeof v === "string" &&
          v.length <= 4000
        ) {
          const ids = v ? v.split(",") : [];
          if (ids.some((id) => !/^[a-f\d-]{36}$/i.test(id)))
            throw domainError("E_INVALID_DOC", "Invalid relationship.");
          const allowed =
            k === "relatedPages"
              ? (
                  await tx
                    .select({ id: docPages.id })
                    .from(docPages)
                    .where(
                      and(
                        eq(docPages.docId, doc.id),
                        isNull(docPages.archivedAt),
                      ),
                    )
                ).map((p) => p.id)
              : k === "relatedTasks"
                ? (
                    await tx
                      .select({ id: nodes.id })
                      .from(nodes)
                      .where(
                        and(
                          eq(nodes.projectId, doc.projectId),
                          isNull(nodes.archivedAt),
                        ),
                      )
                  ).map((n) => n.id)
                : (
                    await tx
                      .select({ id: projectMembers.userId })
                      .from(projectMembers)
                      .where(eq(projectMembers.projectId, doc.projectId))
                  ).map((m) => m.id);
          if (ids.some((id) => !allowed.includes(id)))
            throw domainError(
              "E_INVALID_DOC",
              "Choose relationships within this project.",
            );
          settings[k] = [...new Set(ids)].join(",");
        } else if (
          k === "cover" &&
          typeof v === "string" &&
          (v === "" || /^\/api\/doc-assets\/[a-f\d-]{36}$/i.test(v))
        )
          settings[k] = v;
        else throw domainError("E_INVALID_DOC", "Invalid page setting.");
      }
      if (settings.cover) {
        const [asset] = await tx
          .select()
          .from(docAssets)
          .where(
            and(
              eq(docAssets.id, String(settings.cover).split("/").at(-1)!),
              eq(docAssets.projectId, doc.projectId),
            ),
          );
        if (!asset || !asset.mime.startsWith("image/"))
          throw domainError(
            "E_INVALID_DOC",
            "Choose an image uploaded to this project.",
          );
      }
      if (b.allPages === true) {
        const all = await tx
          .select()
          .from(docPages)
          .where(and(eq(docPages.docId, doc.id), isNull(docPages.archivedAt)));
        if (all.some((p) => p.protected))
          throw domainError(
            "E_FORBIDDEN",
            "Unprotect all pages before applying typography to the entire Doc.",
          );
        for (const p of all) {
          const typography = {
            ...p.settings,
            font: settings.font ?? "system",
            size: settings.size ?? "default",
            wide: settings.wide ?? false,
          };
          await tx
            .update(docPages)
            .set({
              settings: typography,
              updatedAt: new Date(
                Math.max(now.getTime(), p.updatedAt.getTime() + 1),
              ),
              updatedBy: userId,
            })
            .where(eq(docPages.id, p.id));
        }
        return { ok: true };
      }
      await tx
        .update(docPages)
        .set({ settings, updatedAt: now, updatedBy: userId })
        .where(eq(docPages.id, id));
      await stageRemovedAssets(tx, doc.projectId, id, current.settings, settings);
      return { updatedAt: now.toISOString() };
    }
    if (action === "applyTemplate") {
      if (
        typeof b.templateId !== "string" ||
        !/^[a-f\d-]{36}$/i.test(b.templateId)
      )
        throw domainError("E_INVALID_DOC", "Choose a template.");
      const [template] = await tx
        .select()
        .from(docTemplates)
        .where(
          and(
            eq(docTemplates.id, b.templateId),
            eq(docTemplates.projectId, doc.projectId),
          ),
        );
      if (!template || template.kind !== page.template)
        throw domainError(
          "E_INVALID_DOC",
          "Choose a template with the same page layout.",
        );
      // Applying a template creates a new page; never overwrites existing content.
      const copyId = crypto.randomUUID();
      const [copy] = await tx
        .insert(docPages)
        .values({
          id: copyId,
          docId: doc.id,
          depth: 1,
          title: template.title,
          slug: `page-${copyId}`,
          template: template.kind,
          content: parsePageContent(template.content, template.kind),
          sortOrder: Date.now(),
          updatedBy: userId,
        })
        .returning();
      return { slug: copy!.slug };
    }
    throw domainError("E_INVALID_DOC", "Unknown page action.");
  });
  return result;
}
