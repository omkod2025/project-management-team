/**
 * A full page load, on purpose.
 *
 * After a page is created, deleted or restored in Docs or a Wiki, the tree
 * beside it, the editor and the server-rendered page all have to be rebuilt
 * from the server. A client transition would keep the old tree and editor
 * state in hand; a real load does not. Every such navigation goes through
 * here, so the choice is made once and stated once.
 */
export function hardNavigate(href: string): void {
  window.location.assign(href);
}
