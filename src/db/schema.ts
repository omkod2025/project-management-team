/**
 * Drizzle mirror of db/schema.sql.
 *
 * db/schema.sql is authoritative. This file exists so TypeScript knows the
 * shape; it never generates the schema. Drizzle Kit is configured to
 * introspect rather than push, so a divergence surfaces as a diff instead of
 * silently rewriting the database.
 *
 * Column names keep their entity prefixes exactly as in SQL. The JS-side
 * property names drop the prefix, because inside `nodes.name` the prefix is
 * already implied — but the string passed to each column helper is the real
 * column name, and that is what any hand-written SQL must use.
 */

import {
  pgTable, pgEnum, uuid, text, boolean, integer, smallint,
  doublePrecision, date, timestamp, jsonb, primaryKey, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ---------------------------------------------------------------- enums */

export const roleKind = pgEnum('pm_role_kind', ['admin', 'member', 'viewer']);

export const fieldKind = pgEnum('pm_field_kind', [
  'text', 'long_text', 'number', 'money', 'date',
  'select', 'multi_select', 'checkbox', 'people', 'image',
]);

export const stageKind = pgEnum('pm_stage_kind', ['notStarted', 'inProgress', 'done']);
export const sourceKind = pgEnum('pm_source_kind', ['auto', 'manual']);

/* ---------------------------------------------------------------- users */

export const users = pgTable('pmt_users', {
  id: uuid('user_id').primaryKey().defaultRandom(),
  email: text('user_email').notNull(),
  fullName: text('user_full_name').notNull(),
  avatarUrl: text('user_avatar_url'),
  passwordHash: text('user_password_hash'),
  setupToken: text('user_setup_token'),
  setupExpiresAt: timestamp('user_setup_expires_at', { withTimezone: true }),
  /** True while the current password was chosen by somebody other than its owner. */
  mustChangePassword: boolean('user_must_change_password').notNull().default(false),
  isActive: boolean('user_is_active').notNull().default(true),
  createdAt: timestamp('user_created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('user_updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- projects */

export const projects = pgTable('pmt_projects', {
  id: uuid('project_id').primaryKey().defaultRandom(),
  name: text('project_name').notNull(),
  slug: text('project_slug').notNull(),
  description: text('project_description'),
  /** The one select field whose option stages drive automatic actual dates (D-35). */
  statusFieldId: uuid('project_status_field_id'),
  archivedAt: timestamp('project_archived_at', { withTimezone: true }),
  createdAt: timestamp('project_created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('project_updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('pmt_projects_slug_uq').on(t.slug)]);

export const projectMembers = pgTable('pmt_project_members', {
  projectId: uuid('member_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('member_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleKind('member_role').notNull(),
  createdAt: timestamp('member_created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.userId] }),
  index('pmt_project_members_user_idx').on(t.userId),
]);

/* --------------------------------------------------------------- fields */

export const docs = pgTable('pmt_docs', {
  id: uuid('doc_id').primaryKey().defaultRandom(),
  projectId: uuid('doc_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('doc_title').notNull(),
  version: text('doc_version').notNull().default(''),
  createdBy: uuid('doc_created_by').references(() => users.id, { onDelete: 'set null' }),
  archivedAt: timestamp('doc_archived_at', { withTimezone: true }),
  createdAt: timestamp('doc_created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('doc_updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pmt_docs_project_idx').on(t.projectId, t.updatedAt)]);

export const docPages = pgTable('pmt_doc_pages', {
  id: uuid('doc_page_id').primaryKey().defaultRandom(),
  docId: uuid('doc_page_doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
  parentId: uuid('doc_page_parent_id'),
  depth: smallint('doc_page_depth').notNull(),
  title: text('doc_page_title').notNull(),
  slug: text('doc_page_slug').notNull().unique(),
  template: text('doc_page_template').$type<'free' | 'module'>().notNull(),
  nodeId: uuid('doc_page_node_id').references(() => nodes.id, { onDelete: 'set null' }),
  content: jsonb('doc_page_content').$type<Record<string, string>>().notNull().default({ body: '' }),
  settings: jsonb('doc_page_settings').$type<Record<string, string | boolean>>().notNull().default({}),
  protected: boolean('doc_page_protected').notNull().default(false),
  sortOrder: doublePrecision('doc_page_sort_order').notNull().default(0),
  updatedBy: uuid('doc_page_updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('doc_page_updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  archivedAt: timestamp('doc_page_archived_at', { withTimezone: true }),
});

export const docRevisions = pgTable('pmt_doc_page_revisions', {
  id: uuid('revision_id').primaryKey().defaultRandom(),
  pageId: uuid('revision_page_id').notNull().references(() => docPages.id, { onDelete: 'cascade' }),
  editorId: uuid('revision_editor_id').references(() => users.id, { onDelete: 'set null' }),
  content: jsonb('revision_content').$type<Record<string, string>>().notNull(),
  updatedAt: timestamp('revision_updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export const docComments = pgTable('pmt_doc_comments', {
  id: uuid('comment_id').primaryKey().defaultRandom(),
  pageId: uuid('comment_page_id').notNull().references(() => docPages.id, { onDelete: 'cascade' }),
  authorId: uuid('comment_author_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('comment_body').notNull(), quote: text('comment_quote').notNull().default(''),
  parentId: uuid('comment_parent_id'), assigneeId: uuid('comment_assignee_id').references(()=>users.id,{onDelete:'set null'}),
  resolved: boolean('comment_resolved').notNull().default(false),
  createdAt: timestamp('comment_created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const docTemplates = pgTable('pmt_doc_templates', {
  id: uuid('template_id').primaryKey().defaultRandom(),
  projectId: uuid('template_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('template_title').notNull(), kind: text('template_kind').$type<'free'|'module'>().notNull(),
  content: jsonb('template_content').$type<Record<string,string>>().notNull(),
  createdAt: timestamp('template_created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const docAssets = pgTable('pmt_doc_assets', {
  id: uuid('asset_id').primaryKey().defaultRandom(),
  projectId: uuid('asset_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  uploaderId: uuid('asset_uploader_id').references(() => users.id, { onDelete: 'set null' }),
  filename: text('asset_filename').notNull(),
  mime: text('asset_mime').notNull(),
  bytes: integer('asset_bytes').notNull(),
  createdAt: timestamp('asset_created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fieldDefinitions = pgTable('pmt_field_definitions', {
  id: uuid('field_id').primaryKey().defaultRandom(),
  projectId: uuid('field_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('field_name').notNull(),
  /** Immutable after creation (D-31). */
  kind: fieldKind('field_kind').notNull(),
  position: integer('field_position').notNull().default(0),
  settings: jsonb('field_settings').$type<FieldSettings>().notNull().default({}),
  archivedAt: timestamp('field_archived_at', { withTimezone: true }),
  createdAt: timestamp('field_created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('field_updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fieldOptions = pgTable('pmt_field_options', {
  id: uuid('option_id').primaryKey().defaultRandom(),
  fieldId: uuid('option_field_id').notNull().references(() => fieldDefinitions.id, { onDelete: 'cascade' }),
  label: text('option_label').notNull(),
  /** Index into the tab wheel in DESIGN.md, 1..6 — never a raw hex value. */
  colorIndex: smallint('option_color_index').notNull().default(1),
  /** NULL means this option triggers no automatic date capture (D-34b). */
  stage: stageKind('option_stage'),
  position: integer('option_position').notNull().default(0),
  /** Options are archived, never deleted (D-33). */
  archivedAt: timestamp('option_archived_at', { withTimezone: true }),
  createdAt: timestamp('option_created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pmt_field_options_field_idx').on(t.fieldId, t.position)]);

/* ---------------------------------------------------------------- nodes */

export const nodes = pgTable('pmt_nodes', {
  id: uuid('node_id').primaryKey().defaultRandom(),
  projectId: uuid('node_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('node_parent_id'),
  /** 1 project, 2 module, 3 task, 4..6 subtask. Ceiling is MAX_DEPTH (D-2). */
  depth: smallint('node_depth').notNull(),
  name: text('node_name').notNull(),
  sortOrder: doublePrecision('node_sort_order').notNull().default(0),

  // The four independent dates (D-10). Nothing may write one from another.
  estimateStart: date('node_estimate_start'),
  estimateEnd: date('node_estimate_end'),
  actualStart: date('node_actual_start'),
  actualEnd: date('node_actual_end'),

  // The pre-snap values, written once and never modified (D-15).
  actualStartRaw: date('node_actual_start_raw'),
  actualEndRaw: date('node_actual_end_raw'),

  actualSourceStart: sourceKind('node_actual_source_start'),
  actualSourceEnd: sourceKind('node_actual_source_end'),

  customValues: jsonb('node_custom_values').$type<CustomValues>().notNull().default({}),

  archivedAt: timestamp('node_archived_at', { withTimezone: true }),
  createdBy: uuid('node_created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('node_created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('node_updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('pmt_nodes_parent_idx').on(t.parentId),
  index('pmt_nodes_project_idx').on(t.projectId, t.depth, t.sortOrder),
]);

/* ------------------------------------------------------------- calendar */

export const holidays = pgTable('pmt_holidays', {
  date: date('holiday_date').primaryKey(),
  name: text('holiday_name').notNull(),
  createdAt: timestamp('holiday_created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------- jsonb types */

export type FieldSettings = {
  currency?: string;
  precision?: number;
  rows?: number;
  multiple?: boolean;
};

/**
 * `currency` is a **display unit**, not an ISO code.
 *
 * A field may record millions of baht (`M฿`) as easily as baht (`THB`), and
 * the amount is always the number a person would type into the cell. Storing
 * 2_500_000 and showing "2.5 M฿" was the alternative, and was rejected:
 * somebody typing `3` meaning three million would silently store three baht.
 */
export type MoneyValue = { amount: number; currency: string };

/**
 * A node's custom field values, keyed by pmt_field_definitions.field_id.
 * There are no foreign keys here by design (D-32); options are archived
 * rather than deleted so a stored id always resolves.
 *
 * Underscore-prefixed keys are system-owned. `_clickup_id` is written by the
 * importer and the API rejects client writes to any such key.
 */
export type CustomValues = {
  _clickup_id?: string;
} & Record<string, string | number | boolean | string[] | MoneyValue | null>;

/* -------------------------------------------------------- ledger row --- */

/**
 * One row of pmf_project_ledger. Not a table — a function result — so it is
 * declared as a type rather than a Drizzle table. Column names keep the
 * `led_` prefix the function returns.
 */
export type LedgerRow = {
  led_node_id: string;
  led_parent_id: string | null;
  led_depth: number;
  led_name: string;
  led_sort_order: number;
  led_estimate_start: string | null;
  led_estimate_end: string | null;
  led_actual_start: string | null;
  led_actual_end: string | null;
  led_actual_start_raw: string | null;
  led_actual_end_raw: string | null;
  led_source_start: 'auto' | 'manual' | null;
  led_source_end: 'auto' | 'manual' | null;
  led_custom_values: CustomValues;
  led_estimate_workdays: number;
  led_actual_workdays: number;
  /** Signed, in working days. Positive is late. NULL when either end is missing. */
  led_misclosure_start: number | null;
  led_misclosure_end: number | null;
  led_rollup_est_start: string | null;
  led_rollup_est_end: string | null;
  led_rollup_act_start: string | null;
  led_rollup_act_end: string | null;
  led_out_of_closure: boolean;
  /**
   * Q3 — progress is counted, not claimed. Both are 0 for a leaf, so a caller
   * distinguishes "no children" from "no children finished" by the total.
   */
  led_descendant_count: number;
  led_closed_count: number;
};
