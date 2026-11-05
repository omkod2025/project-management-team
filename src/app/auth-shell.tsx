import './auth.css';

/**
 * The frame every door shares.
 *
 * One component rather than three copies of a split layout: sign-in,
 * set-password and change-password are the same room entered from different
 * corridors, and a visitor who arrives at two of them in one minute — which is
 * exactly what claiming an invitation does — must not see two designs.
 *
 * House style (DESIGN.md): a centred white panel on paper, the same chrome as
 * the rest of the signed-in product's dialogs. The estimate/actual graphic
 * that lived here under the earlier indigo-split direction is dropped —
 * nothing on these pages needs the one argument it existed to make.
 */
export default function AuthShell({
  title, lede, children,
}: {
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-mark">
          <FieldBookMark />
          <span>T-Timeline</span>
        </div>

        <div className="auth-form">
          <h1>{title}</h1>
          {lede && <p className="auth-lede">{lede}</p>}
          {children}
        </div>
      </div>
    </main>
  );
}

/** Two leaves and a spine — the book, at the size of a favicon. */
function FieldBookMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M1.5 2.5h5.2c.7 0 1.3.6 1.3 1.3v9.7M14.5 2.5H9.3c-.7 0-1.3.6-1.3 1.3"
        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
      <path d="M1.5 2.5v10h5.2M14.5 2.5v10H9.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
