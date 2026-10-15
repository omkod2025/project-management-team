'use client';

export default function CalendarError({ reset }: { reset: () => void }) {
  return <main style={{ padding: 32, background: '#f8fafd', minHeight: '100dvh' }}>
    <a href="/">‹ Home</a><h1>Calendar could not load</h1>
    <p role="alert">The project schedules could not be retrieved. Please try again.</p>
    <button onClick={reset}>Try again</button>
  </main>;
}
