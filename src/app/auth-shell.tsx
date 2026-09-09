import './auth.css';

/**
 * The frame every door shares.
 *
 * One component rather than three copies of a split layout: sign-in,
 * set-password and change-password are the same room entered from different
 * corridors, and a visitor who arrives at two of them in one minute — which is
 * exactly what claiming an invitation does — must not see two designs.
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
        <section className="auth-field">
          <div className="auth-mark">
            <FieldBookMark />
            <span>T-Timeline</span>
          </div>

          <div className="auth-figure">
            <PlanAgainstReality />
          </div>

          <div className="auth-claim">
            <h2>The plan and what actually happened, on the same row.</h2>
            <p>
              Every other tracker draws one bar per task, and moves it when
              reality moves — overwriting the date you promised. Here the two
              are separate fields, and the overrun is measured, not remembered.
            </p>
          </div>
        </section>

        <section className="auth-leaf">
          <div className="auth-form">
            <h1>{title}</h1>
            {lede && <p className="auth-lede">{lede}</p>}
            {children}
          </div>
        </section>
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

/**
 * The product's whole argument, drawn.
 *
 * A task planned to finish on the eighth working day and finished on the
 * eleventh: the estimate hatched above, the actual solid below, and the three
 * days between them called out. The overhang is drawn in vermilion lightened
 * to hold on indigo — being out of closure is the one thing that colour is
 * permitted to mean anywhere in this product (DESIGN.md § Colors rule 1), so
 * the door obeys the same law as the grid behind it. The only other vermilion
 * on these pages is the errata band, which is a write that did not land.
 *
 * Drawn rather than sourced: the reference composition put a stock mascot
 * here, and a mascot would say nothing a competitor's login could not.
 */
function PlanAgainstReality() {
  const PLAN_END = 300;      // where the estimate stopped
  const REAL_END = 372;      // where the work actually stopped
  const WKND_A = 312;        // the Saturday and Sunday the overrun ran through
  const WKND_B = 356;
  const ticks = Array.from({ length: 18 }, (_, i) => 4 + i * 22);

  return (
    <svg
      viewBox="0 0 400 200"
      role="img"
      aria-label="An estimate bar and an actual bar on the same row. The actual runs three working days past the plan, and the overrun is marked +3d."
    >
      <defs>
        {/* Pencil, not ink: the estimate is a drawing of an intention. Two
            densities, so the bar has a near edge and a far one rather than
            reading as one flat screen. */}
        <pattern id="fb-hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.66)" strokeWidth="1.5" />
        </pattern>
        <pattern id="fb-hatch-far" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.34)" strokeWidth="1.1" />
        </pattern>
        {/* The solid bar is a physical thing lying on the field, so its lower
            edge is in shade. */}
        <linearGradient id="fb-solid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.72" stopColor="#ffffff" />
          <stop offset="1" stopColor="#D6DBF0" />
        </linearGradient>
        <linearGradient id="fb-over" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EE7259" />
          <stop offset="0.72" stopColor="#E5654E" />
          <stop offset="1" stopColor="#BE4B37" />
        </linearGradient>
      </defs>

      {/* The weekend the product does not count, behind everything: bars cross
          it rather than break, because working days are a lens over calendar
          dates and not a hole in them. */}
      <rect x={WKND_A} y="24" width={WKND_B - WKND_A} height="130" fill="rgba(255,255,255,0.055)" />

      <text
        x="46" y="20" fill="#B9C1E8" fontSize="8.5" letterSpacing="1.6"
        style={{ fontFamily: 'var(--font-struct), sans-serif' }}
      >
        ESTIMATE
      </text>
      {/* Runs off the left edge of the panel: this bar started before the
          viewport did, which is what a plan already under way looks like. */}
      <rect x="-40" y="30" width={PLAN_END + 40} height="20" fill="url(#fb-hatch-far)" />
      <rect x="-40" y="30" width={PLAN_END + 40 - 96} height="20" fill="url(#fb-hatch)" />
      <path d={`M-40 30h${PLAN_END + 40}M-40 50h${PLAN_END + 40}M${PLAN_END} 30v20`} stroke="#ffffff" strokeWidth="1.4" fill="none" />

      <text
        x="46" y="82" fill="#B9C1E8" fontSize="8.5" letterSpacing="1.6"
        style={{ fontFamily: 'var(--font-struct), sans-serif' }}
      >
        ACTUAL
      </text>
      <rect x="-40" y="92" width={PLAN_END + 40} height="26" fill="url(#fb-solid)" />
      <rect x={PLAN_END} y="92" width={REAL_END - PLAN_END} height="26" fill="url(#fb-over)" />

      {/* The measure between the two ends — the figure the product exists for. */}
      <line x1={PLAN_END} y1="30" x2={PLAN_END} y2="146" stroke="#E5654E" strokeWidth="1.2" strokeDasharray="3 3" />
      <line x1={REAL_END} y1="92" x2={REAL_END} y2="146" stroke="#E5654E" strokeWidth="1.2" strokeDasharray="3 3" />
      <path
        d={`M${PLAN_END} 140v12M${REAL_END} 140v12M${PLAN_END} 146h${REAL_END - PLAN_END}`}
        stroke="#E5654E" strokeWidth="1.3"
      />
      <text
        x={(PLAN_END + REAL_END) / 2} y="170" fill="#F5AC9E" fontSize="13" textAnchor="middle"
        style={{ fontFamily: 'var(--font-figure), monospace' }}
      >
        +3d
      </text>

      {/* The day ruler everything above is measured on. */}
      <line x1="-40" y1="186" x2="392" y2="186" stroke="rgba(255,255,255,0.32)" strokeWidth="1" />
      {ticks.map((x) => {
        const weekend = x >= WKND_A && x <= WKND_B;
        return (
          <line
            key={x}
            x1={x} y1={weekend ? 178 : 186} x2={x} y2={weekend ? 194 : 191}
            stroke={weekend ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.32)'}
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}
