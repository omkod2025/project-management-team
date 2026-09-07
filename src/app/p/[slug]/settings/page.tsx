import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { currentUserId } from '@/auth';
import { db } from '@/db/client';
import { projects } from '@/db/schema';
import { loadSettings, isProjectAdmin } from '@/lib/admin';
import SettingsView from './settings-view';

export default async function ProjectSettings({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const { slug } = await params;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.slug, slug), isNull(projects.archivedAt)))
    .limit(1);

  // A non-admin gets a 404 rather than a 403, for the same reason a
  // non-member does: an error that confirms existence is itself a leak.
  if (!project || !(await isProjectAdmin(userId, project.id))) notFound();

  return <SettingsView settings={await loadSettings(project.id)} slug={slug} />;
}
