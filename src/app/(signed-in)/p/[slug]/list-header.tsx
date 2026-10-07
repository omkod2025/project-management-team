'use client';
import type { ReactNode } from 'react';
import ProjectTitle from './project-title';
import Bell from '../../bell';
import { siblingHref } from './view-state';
import type { WorkKind } from '@/lib/work-kind';
export default function ListHeader({ projectId, projectName, slug, isAdmin, kind, selected = null, signOut }: {
  projectId: string; projectName: string; slug: string; isAdmin: boolean; kind: WorkKind; selected?: string | null; signOut: ReactNode;
}) { return (<header className="head">
          {/* Up a level, to the shelf. Deliberately not in the view nav
              beside List / Timeline / Report: those are views *of this
              project* and this is the way out of it — filing a level change
              among sibling views because the two sit near each other is the
              grouping-by-adjacency this page has been unpicking. */}
          <a className="shelf label" href="/">‹ Home</a>
          <ProjectTitle projectId={projectId} name={projectName} canRename={isAdmin} />
          {/* The bell stands immediately before the view nav, so notice and
              navigation sit together in the one cluster this header already
              uses for "where do I go from here" (spec 11 §6). */}
          <Bell />
          <div className="views label">
            <span aria-current="page">List</span>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={siblingHref(`/p/${slug}/timeline`, kind === 'task' ? selected : null)}>Timeline</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={`/p/${slug}/report`}>Report</a>
            <a href={`/p/${slug}/docs`}>Docs</a>
            {isAdmin && (
              <>
                <span style={{ color: 'var(--color-rule)' }}>·</span>
                <a href={`/p/${slug}${kind === 'defect' ? '/defects' : ''}/settings`}>Settings</a>
              </>
            )}
          </div>
          {/* Sits after the view nav rather than beside the shelf link, so the
              one control that ends the session is not adjacent to the one a
              hand reaches for constantly. Same reasoning as the shelf link's:
              it changes level, so it is not in the view nav. */}
          {signOut}
        </header>); }
