/**
 * The token module registry, and the grant and scope shapes read from it.
 *
 * Split out of `token-rules.ts` so the Tokens / MCP stepper — a client
 * component — can read the same declaration the server validates against,
 * without pulling `node:crypto` (which `token-rules.ts` needs for secrets)
 * into the browser bundle. `token-rules.ts` re-exports everything here, so
 * server code keeps importing from one place.
 */

export type ModuleKey = 'list' | 'docs' | 'wiki';

/** What a scope row inside a module's grant names: a project, or a module-owned item such as a wiki. */
export type ScopeKind = 'project' | 'wiki';

export type TokenPermission = { key: string; label: string; hint: string };

export type TokenModule = {
  key: ModuleKey;
  label: string;
  /** What the module is, on its card in the stepper's first step. */
  hint: string;
  /** What the always-on Read lets a token do in this module. */
  readHint: string;
  scope: ScopeKind;
  permissions: readonly TokenPermission[];
};

/**
 * The declaration every other piece of the central MCP tokens work reads:
 * the stepper, grant validation, storage and MCP tool registration (design
 * doc, "Extensible by declaration"). Adding a module means adding one entry
 * here and its tools, not a migration that adds columns.
 *
 * Read is not listed as a permission — choosing a module grants it, and it
 * can never be revoked on its own (`hasModule`).
 */
export const TOKEN_MODULES: readonly TokenModule[] = [
  {
    key: 'list',
    label: 'List',
    hint: 'Tasks in your projects.',
    readHint: 'Read tasks.',
    scope: 'project',
    permissions: [
      { key: 'create_task', label: 'Create task', hint: 'Add new tasks.' },
      { key: 'write_task', label: 'Write', hint: 'Edit any field of a task, including dates and status.' },
    ],
  },
  {
    key: 'docs',
    label: 'Docs',
    hint: 'Documents in your projects.',
    readHint: 'Read docs and their pages.',
    scope: 'project',
    permissions: [
      { key: 'create_doc', label: 'Create doc', hint: 'Create new docs.' },
      { key: 'create_page', label: 'Create page', hint: 'Add new pages to a doc.' },
      { key: 'write_page', label: 'Write', hint: 'Edit a page’s content.' },
    ],
  },
  {
    key: 'wiki',
    label: 'Wiki',
    hint: 'The knowledge base.',
    readHint: 'Read and search wiki pages.',
    scope: 'wiki',
    permissions: [
      { key: 'create_wiki', label: 'Create wiki', hint: 'Create new wikis.' },
      { key: 'create_page', label: 'Create page', hint: 'Add new pages to a wiki.' },
      { key: 'write_wiki', label: 'Write', hint: 'Edit a wiki’s title or description, and page content.' },
    ],
  },
];

export function findModule(key: string): TokenModule | undefined {
  return TOKEN_MODULES.find((m) => m.key === key);
}

/**
 * What a token may do: a module key is present exactly when the token reads
 * that module, and its array is the Create/Write permissions on top of that
 * read (design doc, "Read is drawn as a ticked checkbox that cannot be
 * unticked"). An absent key means the token does not reach that module at
 * all; `{}` is a token that reaches nothing yet.
 */
export type TokenGrants = Partial<Record<ModuleKey, string[]>>;

/** Whether a token reads a module at all — the implied permission every module carries. */
export function hasModule(g: TokenGrants, m: ModuleKey): boolean {
  return Object.hasOwn(g, m);
}

/** Whether a token holds a specific Create/Write permission in a module (never true for `'read'` itself — use `hasModule`). */
export function hasGrant(g: TokenGrants, m: ModuleKey, permission: string): boolean {
  return g[m]?.includes(permission) ?? false;
}

/** What a token is scoped to: the projects it may reach, and the wikis it may reach. */
export type TokenScope = { projectIds: string[]; wikiIds: string[] };

/**
 * The scope kinds some granted module declares. Scope of any other kind is
 * unreachable, so it is neither kept by `normalizeScope` nor left stored by
 * an edit that drops the last module of that kind.
 */
export function scopeKindsInUse(g: TokenGrants): Set<ScopeKind> {
  return new Set(TOKEN_MODULES.filter((m) => hasModule(g, m.key)).map((m) => m.scope));
}
