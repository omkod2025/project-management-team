import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { rawQuery } from '@/db/client';
import NewProject from './new-project';
import SignOut from './sign-out';
import './shelf.css';

/**
 * The shelf: every project this user is a member of.
 *
 * Scoped by membership, so a project with no membership row is not merely
 * hidden — it is absent from the query (spec 05 §4).
 *
 * Laid out to the dashboard reference supplied on 2026-09-08: a fixed index
 * rail on the left, the work on the right, and the run broken into blocks with
 * a headed count. The departures from DESIGN.md that costs are named at the top
 * of `shelf.css`, as `list.css` names its own.
 *
 * Everything on this page is a fact the database holds. Nothing here is a
 * decorative control: there is no filter that filters nothing and no sort arrow
 * that does not sort, because the reference's toolbar of pills is the one thing
 * in it that would have to be faked.
 */

type Row = {
  project_id: string;
  project_name: string;
  project_slug: string;
  member_role: 'admin' | 'member' | 'viewer';
  node_count: string;
  dated_count: string;
};

type Member = { member_project_id: string; user_full_name: string };

/** Roles in the order they are read: what I run, what I work in, what I watch. */
const ROLE_ORDER = ['admin', 'member', 'viewer'] as const;
const ROLE_HEAD: Record<Row['member_role'], string> = {
  admin: 'I administer',
  member: 'I work in',
  viewer: 'I can read',
};
const ROLE_NOTE: Record<Row['member_role'], string> = {
  admin: 'Columns, members and the calendar are mine to change.',
  member: 'I hold work here; the field definitions belong to someone else.',
  viewer: 'Read only. Nothing on these boards moves at my hand.',
};

/** The shelf re-lets the six module hues to the *project*. See roster.ts. */
const HUE_COUNT = 6;

export default async function Home() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const [rows, me, members] = await Promise.all([
    rawQuery<Row>(
      `SELECT p.project_id, p.project_name, p.project_slug, m.member_role,
              count(n.node_id) FILTER (WHERE n.node_archived_at IS NULL)                            AS node_count,
              count(n.node_id) FILTER (WHERE n.node_archived_at IS NULL
                                         AND n.node_estimate_end IS NOT NULL)                       AS dated_count
         FROM pmt_projects p
         JOIN pmt_project_members m ON m.member_project_id = p.project_id
         LEFT JOIN pmt_nodes n      ON n.node_project_id  = p.project_id
        WHERE m.member_user_id = $1
          AND p.project_archived_at IS NULL
        GROUP BY p.project_id, p.project_name, p.project_slug, m.member_role
        ORDER BY p.project_name`,
      [userId],
    ),
    rawQuery<{ user_full_name: string; user_email: string }>(
      'SELECT user_full_name, user_email FROM pmt_users WHERE user_id = $1',
      [userId],
    ),
    // Who else is on each of my boards. Read through my own membership rather
    // than from the project, so this cannot become a way to enumerate people on
    // a project I am not in.
    rawQuery<Member>(
      `SELECT m.member_project_id, u.user_full_name
         FROM pmt_project_members m
         JOIN pmt_users u ON u.user_id = m.member_user_id
        WHERE m.member_project_id IN (SELECT member_project_id
                                        FROM pmt_project_members
                                       WHERE member_user_id = $1)
        ORDER BY u.user_full_name`,
      [userId],
    ),
  ]);

  const account = me[0];
  const crew = new Map<string, string[]>();
  for (const m of members) {
    const list = crew.get(m.member_project_id) ?? [];
    list.push(m.user_full_name);
    crew.set(m.member_project_id, list);
  }

  // Alphabetical, which is the order the query returns and the order the roster
  // hues are assigned in — so a project is the same colour on both pages.
  const hue = new Map(rows.map((r, i) => [r.project_id, (i % HUE_COUNT) + 1] as const));

  const blocks = ROLE_ORDER.map((role) => ({
    role,
    rows: rows.filter((r) => r.member_role === role),
  })).filter((b) => b.rows.length > 0);

  const dated = rows.reduce((n, r) => n + Number(r.dated_count), 0);
  const nodes = rows.reduce((n, r) => n + Number(r.node_count), 0);

  return (
    <div className="sh">
      <aside className="sh-rail">
        <div className="sh-brand">
          <span className="sh-mark" aria-hidden="true" />
          <span className="sh-brand-name">Field Book</span>
        </div>

        {account && (
          <div className="sh-account">
            <span className="sh-avatar sh-avatar-lg" aria-hidden="true">{initials(account.user_full_name)}</span>
            <span className="sh-account-text">
              <span className="sh-account-label">Signed in</span>
              <span className="sh-account-name" title={account.user_email}>{account.user_full_name}</span>
            </span>
          </div>
        )}

        <nav className="sh-nav" aria-label="Field Book">
          <span className="sh-nav-item" aria-current="page">
            <IconShelf />
            Projects
            <span className="sh-nav-count figure">{rows.length}</span>
          </span>
          {/* The roster reads across every project at once, so it belongs
              beside the shelf rather than inside any one of them. */}
          <Link className="sh-nav-item" href="/timeline">
            <IconTimeline />
            Roster timeline
          </Link>
          {/* The shelf is the only level at which "who can reach what" is a
              whole question — inside a project you can only ever see that
              project's half of it. */}
          <Link className="sh-nav-item" href="/people">
            <IconPeople />
            People and access
          </Link>
        </nav>

        <div className="sh-rail-foot">
          <SignOut className="sh-btn sh-btn-quiet" />
        </div>
      </aside>

      <main className="sh-work">
        <header className="sh-work-head">
          <div className="sh-work-title">
            <h1>Projects</h1>
            <p className="sh-work-sub">
              {rows.length === 0
                ? 'Nothing on the shelf yet.'
                : <>
                    <strong className="figure">{dated}</strong> of{' '}
                    <strong className="figure">{nodes}</strong> tasks carry an estimated end date
                  </>}
            </p>
          </div>
          <NewProject />
        </header>

        <div className="sh-work-body">
          {blocks.map(({ role, rows: block }) => (
            <section className="sh-block" key={role} aria-labelledby={`block-${role}`}>
              <div className="sh-block-head">
                <span className={`sh-block-bar sh-role-${role}`} aria-hidden="true" />
                <h2 id={`block-${role}`}>{ROLE_HEAD[role]}</h2>
                <span className="sh-count figure">{block.length}</span>
                <p className="sh-block-note">{ROLE_NOTE[role]}</p>
              </div>

              <table className="sh-run">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col" className="sh-col-crew">Team</th>
                    <th scope="col" className="sh-col-num">Tasks</th>
                    <th scope="col" className="sh-col-meter">Dated</th>
                  </tr>
                </thead>
                <tbody>
                  {block.map((r) => {
                    const total = Number(r.node_count);
                    const done = Number(r.dated_count);
                    const team = crew.get(r.project_id) ?? [];
                    return (
                      <tr key={r.project_id} style={{ ['--hue' as string]: `var(--color-tab-${hue.get(r.project_id)})` }}>
                        <td className="sh-cell-name">
                          <Link className="sh-project" href={`/p/${r.project_slug}`}>
                            <span className="sh-tile" aria-hidden="true">{initials(r.project_name)}</span>
                            <span className="sh-project-text">
                              <span className="sh-project-name">{r.project_name}</span>
                              <span className="sh-project-slug">/p/{r.project_slug}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="sh-col-crew">
                          <Crew names={team} />
                        </td>
                        <td className="sh-col-num">
                          {total === 0
                            ? <span className="sh-dash" aria-label="no tasks yet">—</span>
                            : <span className="figure">{total}</span>}
                        </td>
                        <td className="sh-col-meter">
                          <Meter dated={done} total={total} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}

          {rows.length === 0 && (
            <div className="sh-blank">
              <p className="sh-blank-line">No projects yet.</p>
              <p className="sh-blank-note">
                Start one above and it opens on an empty list, ready for its first module —
                or wait for an admin to add you to theirs.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * How much of a project is scheduled at all — dated tasks over live tasks.
 *
 * Segmented rather than a continuous bar, and captioned with both figures on
 * hover: this is a count of rows, not a percentage anyone entered. Progress in
 * this product is always counted (PRODUCT.md), and a smooth bar would read as a
 * claim about completion, which is a different fact entirely.
 */
function Meter({ dated, total }: { dated: number; total: number }) {
  const SEGMENTS = 12;
  if (total === 0) return <span className="sh-dash" aria-label="nothing to schedule yet">—</span>;
  const share = dated / total;
  const lit = Math.min(SEGMENTS, Math.max(dated > 0 ? 1 : 0, Math.round(share * SEGMENTS)));
  return (
    <span className="sh-meter" title={`${dated} of ${total} tasks carry an estimated end date`}>
      <span className="sh-meter-track" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={i < lit ? 'sh-seg sh-seg-lit' : 'sh-seg'} />
        ))}
      </span>
      <span className="sh-meter-figure figure">{Math.round(share * 100)}%</span>
    </span>
  );
}

/** Up to four faces, then a count. Names in full on hover, and in the label. */
function Crew({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="sh-dash">—</span>;
  const shown = names.slice(0, 4);
  const rest = names.length - shown.length;
  return (
    <span className="sh-crew" title={names.join(', ')}>
      {shown.map((n) => (
        <span className="sh-avatar" key={n} aria-hidden="true">{initials(n)}</span>
      ))}
      {rest > 0 && <span className="sh-avatar sh-avatar-rest" aria-hidden="true">+{rest}</span>}
      <span className="sh-sr">{names.join(', ')}</span>
    </span>
  );
}

/**
 * One letter for Thai, two for Latin.
 *
 * Thai has no case and its second character is as often a vowel sign as a
 * letter — "สว" from "สวัสดี" is a fragment rather than a monogram, and a
 * combining mark orphaned into a 28px tile draws as a stray tick.
 */
function initials(name: string): string {
  // Punctuation is not a monogram: real project names here include "[DEV] JO",
  // which read as "[J" until the brackets were dropped.
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!][0]!;
  if (/[฀-๿]/.test(first)) return first;
  const second = words.length > 1 ? [...words[words.length - 1]!][0]! : '';
  return (first + second).toUpperCase();
}

/* Icons: one family, 16px box, 1.4px stroke, square caps softened at the
   joins only — drawn rather than imported so the set stays three. */
const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function IconShelf() {
  return (
    <svg {...ICON}>
      <path d="M2.5 3.5h3.5v9h-3.5zM7.25 3.5h2.5v9h-2.5z" />
      <path d="M11.4 4.2l2.1.5-1.7 8-2.1-.5" />
    </svg>
  );
}

function IconTimeline() {
  return (
    <svg {...ICON}>
      <path d="M2 4.6h7M4.5 8h8.5M2 11.4h5.5" />
      <path d="M11.5 2.5v11" strokeDasharray="1.6 1.8" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg {...ICON}>
      <circle cx="6.2" cy="5.6" r="2.3" />
      <path d="M2.2 13.2c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" />
      <path d="M10.8 4.1a2.3 2.3 0 0 1 0 4.4M11.6 9.9c1.4.4 2.3 1.6 2.3 3.3" />
    </svg>
  );
}
