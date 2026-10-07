export type WorkKind = 'task' | 'defect';

/** Project work pages show only their own notifications. Other pages keep the combined inbox. */
export function workKindForPath(path: string): WorkKind | undefined {
  if (/^\/p\/[^/]+\/defects(?:\/|$)/.test(path)) return 'defect';
  if (/^\/p\/[^/]+(?:\/(?:timeline|report|settings))?\/?$/.test(path)) return 'task';
  return undefined;
}

export function notificationKind(value: string | null): WorkKind | undefined {
  return value === 'task' || value === 'defect' ? value : undefined;
}

/** Only work-list endpoints are scoped; users, assets and membership are shared. */
export function workApi(url: string, kind: WorkKind): string {
  return kind === 'defect' ? url.replace(/^\/api\/(nodes|fields|options|projects)(?=\/|$)/, '/api/defects/$1') : url;
}

export function workStateKey(slug: string, kind: WorkKind): string {
  return kind === 'defect' ? `${slug}:defect` : slug;
}
