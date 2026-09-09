# Docs UX reference — 2026-09-08

Inspected the supplied ClickUp Doc in the connected Edge browser. Opened the icon picker, Page Styles and page context menu without changing content or sharing settings.

Second editor inspection: selected existing text and inspected the floating formatting bar, Turn Into, More formatting and its Insert submenu. ClickUp exposes list controls, headings, inline marks, links, alignment/colors, Undo/Redo, clear formatting, Markdown copy and Floating/Top toolbar position. Insert includes images, dividers, tables, toggles, buttons, table of contents and embeds. Selection/menu exploration did not change the ClickUp document.

Observed: persistent Pages sidebar and Add page action; document title and modified metadata; page styles (type, width, outline); page menu (rename, link, duplicate, templates, history); formatting controls, image and table content. This document is publicly shared, so no test pages or edits were made in ClickUp.

Applied to the project:

- Create with a title first; optional template and location stay under a disclosure.
- Creating a page opens editing immediately, with focus in the first section.
- A per-page plus action preselects the parent; branches can collapse.
- A centered reading column can switch to full width.
- Typing `/` at the start of a paragraph opens searchable block commands. Arrow keys, Enter and Escape work; clicking outside dismisses it.
- Existing autosave, stale-write protection, Markdown storage and project permissions remain unchanged.
- Selection-first floating toolbar with compact mark controls and Turn Into / Lists / More menus. Top toolbar is available for keyboard or persistent access.
- Block-gutter plus opens a searchable insertion menu at the cursor. It inserts after selected content without replacing it.
- Page Styles rail offers system/serif/mono, size and width as view preferences. Outline derives from actual headings, and history opens in a side panel.
- Copy Markdown writes to the clipboard, with a selectable-text fallback if clipboard access fails.

Not copied: public sharing, AI actions, comments, custom colors, covers and unsupported Markdown formats. This is an adaptation of the writing flow, not feature parity with ClickUp.

Verification: TypeScript check, seven Docs API tests and thirteen Markdown/rule tests passed. Connected Edge confirmed create-to-edit, `/h2`, Thai text, save-to-read and subpage parent selection. The temporary QA page was archived after verification, preserving its data for recovery.

The second connected-Edge pass confirmed selection Bold, Floating-to-Top, page style/outline menus, table insertion preserving the selected original text, and zero horizontal overflow at a 390px viewport. Color/alignment/underline/strike, toggle blocks and embeds remain excluded by the Markdown spec rather than appearing as nonfunctional controls.
