import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadLedger } from '@/lib/ledger';
import { DomainError } from '@/lib/errors';
import CalendarView from './calendar-view';

export default async function ProjectCalendar({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  const { slug } = await params;
  try {
    const { project, rows, holidays } = await loadLedger(userId, slug);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return <CalendarView projectName={project.name} slug={slug} rows={rows} holidays={holidays} today={today} />;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'E_NOT_FOUND') notFound();
    throw error;
  }
}
