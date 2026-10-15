import Link from 'next/link';

export default function CalendarLoading() {
  return <main style={{ padding: 32, background: '#f8fafd', minHeight: '100dvh' }}>
    <Link href="/">‹ Home</Link><h1>Calendar</h1><p role="status">Loading project schedules…</p>
  </main>;
}
