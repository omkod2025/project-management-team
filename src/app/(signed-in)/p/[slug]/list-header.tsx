'use client';
import ProjectTitle from './project-title';
import AppHeader from '../../app-header';
import { projectViews } from './project-views';
import type { WorkKind } from '@/lib/work-kind';
export default function ListHeader({ projectId, projectName, slug, isAdmin, kind, selected = null }: {
  projectId: string; projectName: string; slug: string; isAdmin: boolean; kind: WorkKind; selected?: string | null;
}) {
  return <AppHeader
    title={<ProjectTitle projectId={projectId} name={projectName} canRename={isAdmin} />}
    navLabel="Project views"
    views={projectViews(slug, 'List', { canSettings: isAdmin, selected: kind === 'task' ? selected : null, defects: kind === 'defect' })}
  />;
}
