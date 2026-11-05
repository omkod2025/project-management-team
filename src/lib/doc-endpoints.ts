/** Where a page editor saves, reads history and uploads files. Project Docs and
 * the Wiki share one editor; only these routes differ. */
export type DocEndpoints = { savePage(id: string): string; history(id: string): string; uploadAsset: string; assetPrefix: string };

export const projectDocEndpoints = (projectId: string): DocEndpoints => ({ savePage: id => `/api/doc-pages/${id}`, history: id => `/api/doc-pages/${id}/history`, uploadAsset: `/api/projects/${projectId}/doc-assets`, assetPrefix: '/api/doc-assets/' });

export const wikiEndpoints = (wikiId: string): DocEndpoints => ({ savePage: id => `/api/wiki-pages/${id}`, history: id => `/api/wiki-pages/${id}/history`, uploadAsset: `/api/wikis/${wikiId}/assets`, assetPrefix: '/api/wiki-assets/' });
